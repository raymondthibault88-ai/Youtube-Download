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

test('a batch owns the common lock, retains partial failures and never reports an all-failed batch as saved', async () => {
  const manager = new JobManager({ channel: 'update' });
  const partial = { ok: false, completed: 1, failed: 1, cancelled: 0, total: 2, items: [] };
  await manager.start('batch', sender(), async ({ update }) => {
    update({
      percent: 40,
      batch: { index: 1, total: 2, completed: 0, failed: 0, currentTitle: 'Vidéo A' }
    });
    await assert.rejects(
      manager.start('download', sender(), async () => ({})),
      /déjà en cours/
    );
    return partial;
  });
  assert.equal(manager.snapshot().state, 'completed');
  assert.equal(manager.snapshot().result, partial);
  assert.equal(manager.snapshot().batch.completed, 1);
  await manager.start('batch', sender(), async () => ({ ...partial, completed: 0, failed: 2 }));
  assert.equal(manager.snapshot().state, 'failed');
  assert.match(manager.snapshot().error, /Aucune vidéo/);
});

test('cancelling a batch retains the files completed before cancellation and releases the common lock', async () => {
  const manager = new JobManager({ channel: 'update' });
  const partial = {
    ok: false,
    completed: 1,
    failed: 0,
    cancelled: 1,
    total: 2,
    items: [{ id: 'BaW_jenozKc', state: 'completed', outputPath: '/exports/video.mp4' }]
  };
  const task = manager.start(
    'batch',
    sender(),
    ({ signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            const error = new Error('Opération annulée.');
            error.name = 'AbortError';
            error.partialResult = partial;
            reject(error);
          },
          { once: true }
        );
      })
  );
  manager.cancel();
  await assert.rejects(task, { name: 'AbortError' });
  assert.equal(manager.snapshot().state, 'cancelled');
  assert.equal(manager.snapshot().result.completed, 1);
  assert.equal(manager.snapshot().error, null);
  await manager.start('conversion', sender(), async () => ({ ok: true }));
  assert.equal(manager.snapshot().state, 'completed');
});
