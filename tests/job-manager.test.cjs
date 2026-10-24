const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { JobManager } = require('../electron/services/job-manager.cjs');

function sender() {
  return Object.assign(new EventEmitter(), { isDestroyed: () => false, send: () => {} });
}

test('one task owns progress and concurrency until it actually finishes', async () => {
  const manager = new JobManager({ channel: 'update' });
  let finish;
  const task = manager.start('download', sender(), async ({ update }) => {
    update({ percent: 65 });
    update({ percent: null, raw: 'Metadata' });
    update({ percent: 2 });
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  assert.equal(manager.snapshot().percent, 65);
  assert.equal(manager.snapshot().controller, undefined);
  assert.equal(manager.snapshot().sender, undefined);
  await assert.rejects(
    manager.start('conversion', sender(), async () => ({})),
    /déjà en cours/
  );
  finish({ outputPath: '/example.mp4' });
  await task;
  assert.equal(manager.snapshot().state, 'completed');
  assert.equal(manager.snapshot().percent, 100);
});

test('user cancellation is neutral and an aborted task releases the lock', async () => {
  const manager = new JobManager({ channel: 'update' });
  const task = manager.start(
    'conversion',
    sender(),
    ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            const error = new Error('Opération annulée.');
            error.name = 'AbortError';
            reject(error);
          },
          { once: true }
        );
      })
  );
  assert.equal(manager.cancel(), true);
  assert.equal(manager.snapshot().state, 'cancelling');
  await assert.rejects(task, { name: 'AbortError' });
  assert.equal(manager.snapshot().state, 'cancelled');
  assert.equal(manager.snapshot().error, null);
  await manager.start('download', sender(), async () => ({ ok: true }));
  assert.equal(manager.snapshot().state, 'completed');
});

test('destroying the source window aborts its running process', async () => {
  const windowSender = sender();
  const manager = new JobManager({ channel: 'update' });
  const task = manager.start(
    'conversion',
    windowSender,
    ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            const error = new Error('Window closed');
            error.name = 'AbortError';
            reject(error);
          },
          { once: true }
        );
      })
  );
  windowSender.emit('destroyed');
  await assert.rejects(task, { name: 'AbortError' });
  assert.equal(manager.snapshot().state, 'cancelled');
  assert.equal(windowSender.listenerCount('destroyed'), 0);
});

test('an already destroyed source cannot start an executor or replace the last job', async () => {
  for (const completedBefore of [false, true]) {
    const manager = new JobManager({ channel: 'update' });
    if (completedBefore)
      await manager.start('conversion', sender(), async () => ({ outputPath: '/preserved.mp4' }));
    const previous = manager.snapshot();
    const closed = Object.assign(sender(), { isDestroyed: () => true });
    let executed = false;
    await assert.rejects(
      manager.start('download', closed, async () => {
        executed = true;
      }),
      { name: 'AbortError' }
    );
    assert.equal(executed, false);
    assert.deepEqual(manager.snapshot(), previous);
    assert.equal(closed.listenerCount('destroyed'), 0);
  }
});

test('destroying the source during its first notification cancels before execution', async () => {
  const manager = new JobManager({ channel: 'update' });
  const windowSender = sender();
  let destroyed = false;
  let executed = false;
  windowSender.isDestroyed = () => destroyed;
  windowSender.send = () => {
    destroyed = true;
    windowSender.emit('destroyed');
  };
  await assert.rejects(
    manager.start('download', windowSender, async () => {
      executed = true;
    }),
    { name: 'AbortError' }
  );
  assert.equal(executed, false);
  assert.equal(manager.snapshot().state, 'cancelled');
  assert.equal(manager.snapshot().error, null);
  assert.equal(windowSender.listenerCount('destroyed'), 0);
});

for (const [phase, failureAt] of [
  ['initial', 1],
  ['progress', 2],
  ['completion', 3]
]) {
  test(`a failed ${phase} notification preserves the job result and releases its lock`, async () => {
    const manager = new JobManager({ channel: 'update' });
    const windowSender = sender();
    let notifications = 0;
    windowSender.send = () => {
      notifications += 1;
      if (notifications === failureAt) throw new Error('Render frame was disposed');
    };
    const result = await manager.start('conversion', windowSender, async ({ signal, update }) => {
      assert.equal(signal.aborted, false);
      update({ percent: 45 });
      assert.equal(manager.snapshot().percent, 45);
      return { outputPath: '/completed.mp4' };
    });
    assert.equal(notifications, 3);
    assert.equal(result.outputPath, '/completed.mp4');
    assert.equal(manager.snapshot().state, 'completed');
    assert.equal(manager.snapshot().percent, 100);
    assert.equal(windowSender.listenerCount('destroyed'), 0);
    await manager.start('download', sender(), async () => ({ outputPath: '/next.mp4' }));
    assert.equal(manager.snapshot().state, 'completed');
    assert.equal(manager.snapshot().result.outputPath, '/next.mp4');
  });
}

test('notification errors cannot block cancellation or replace its neutral error', async () => {
  const manager = new JobManager({ channel: 'update' });
  const windowSender = sender();
  windowSender.send = () => {
    throw new Error('Render frame was disposed');
  };
  const task = manager.start(
    'download',
    windowSender,
    ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const error = new Error('Opération annulée.');
          error.name = 'AbortError';
          reject(error);
        });
      })
  );
  assert.equal(manager.cancel(), true);
  await assert.rejects(task, { name: 'AbortError' });
  assert.equal(manager.snapshot().state, 'cancelled');
  assert.equal(manager.snapshot().error, null);
  assert.equal(windowSender.listenerCount('destroyed'), 0);
});

test('jobs without a renderer remain supported', async () => {
  const manager = new JobManager({ channel: 'update' });
  const result = await manager.start('conversion', null, async ({ update }) => {
    update({ percent: 25 });
    return { outputPath: '/background.mp4' };
  });
  assert.equal(result.outputPath, '/background.mp4');
  assert.equal(manager.snapshot().state, 'completed');
});
