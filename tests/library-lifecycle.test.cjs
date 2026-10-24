const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const ipc = require('../shared/ipc.json');
const { JobManager } = require('../electron/services/job-manager.cjs');
const { createAbortError } = require('../electron/services/process-runner.cjs');

function deferred() {
  let resolve;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function sender() {
  return Object.assign(new EventEmitter(), {
    destroyed: false,
    isDestroyed() {
      return this.destroyed;
    },
    send() {},
    destroy() {
      this.destroyed = true;
      this.emit('destroyed');
    }
  });
}

function harness({ accountReady = Promise.resolve(), account = {}, getYoutube } = {}) {
  const source = path.resolve(__dirname, '../electron/ipc/register-library-handlers.cjs');
  const localRequire = createRequire(source);
  const handlers = new Map();
  const calls = { mkdir: 0, getYoutube: 0, batch: 0, connect: 0 };
  const accountService = {
    snapshot: () => ({
      configured: true,
      connected: false,
      connecting: false,
      channel: null,
      error: null
    }),
    connect: async () => {
      calls.connect += 1;
      return accountService.snapshot();
    },
    cancelConnect: () => {},
    ...account
  };
  const sandbox = {
    AbortController,
    AbortSignal,
    module: { exports: {} },
    require(name) {
      if (name === 'electron') return { dialog: {} };
      if (name === 'node:fs')
        return {
          promises: {
            mkdir: async () => {
              calls.mkdir += 1;
            }
          }
        };
      if (name === '../services/download-batch.cjs') {
        return {
          ...localRequire(name),
          runDownloadBatch: async () => {
            calls.batch += 1;
            return { ok: true, items: [], completed: 1, failed: 0, cancelled: 0, total: 1 };
          }
        };
      }
      return localRequire(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), sandbox, { filename: source });
  const jobs = new JobManager({ channel: ipc.events.jobUpdate });
  sandbox.module.exports.registerLibraryHandlers({
    app: new EventEmitter(),
    handle: (channel, handler) => handlers.set(channel, handler),
    jobs,
    getYoutube: async () => {
      calls.getYoutube += 1;
      return getYoutube?.() || {};
    },
    dependencyService: {},
    updateService: { assertCanStartJob() {} },
    revealablePaths: new Set(),
    accountService,
    accountReady
  });
  return { handlers, calls, jobs };
}

const batchPayload = {
  items: [{ url: 'https://youtu.be/BaW_jenozKc', title: 'Vidéo source' }],
  outputDir: process.cwd()
};

test(
  'an already destroyed window cannot claim a media job or execute its operation',
  { timeout: 5000 },
  async () => {
    const jobs = new JobManager({ channel: ipc.events.jobUpdate });
    const windowSender = sender();
    windowSender.destroy();
    let executed = false;
    await assert.rejects(
      jobs.start('batch', windowSender, async () => {
        executed = true;
        return { completed: 1, failed: 0, total: 1, items: [] };
      }),
      { name: 'AbortError' }
    );
    assert.equal(executed, false);
    assert.equal(jobs.snapshot(), null);
    assert.equal(windowSender.listenerCount('destroyed'), 0);
  }
);

test(
  'destroying the window while account initialization is pending never opens OAuth afterward',
  { timeout: 5000 },
  async () => {
    const ready = deferred();
    const { handlers, calls } = harness({ accountReady: ready.promise });
    const windowSender = sender();
    const connection = handlers.get(ipc.invoke.accountConnect)({ sender: windowSender });
    windowSender.destroy();
    ready.resolve();
    await assert.rejects(connection, { name: 'AbortError' });
    assert.equal(calls.connect, 0);
    assert.equal(windowSender.listenerCount('destroyed'), 0);
  }
);

test(
  'destroying the window during batch dependency preparation never starts the batch',
  { timeout: 5000 },
  async () => {
    const preparing = deferred();
    const requested = deferred();
    const { handlers, calls, jobs } = harness({
      getYoutube: () => {
        requested.resolve();
        return preparing.promise;
      }
    });
    const windowSender = sender();
    const operation = handlers.get(ipc.invoke.downloadBatch)(
      { sender: windowSender },
      batchPayload
    );
    await requested.promise;
    windowSender.destroy();
    preparing.resolve({});
    await assert.rejects(operation, { name: 'AbortError' });
    assert.equal(calls.batch, 0);
    assert.equal(jobs.snapshot(), null);
    assert.equal(windowSender.listenerCount('destroyed'), 0);
  }
);

test(
  'cancelling an account video listing aborts its API signal and removes window listeners',
  { timeout: 5000 },
  async () => {
    const requested = deferred();
    let requestSignal;
    const { handlers } = harness({
      account: {
        listVideos: ({ signal, playlistId }) => {
          assert.equal(playlistId, 'PL1234567890');
          requestSignal = signal;
          requested.resolve();
          return new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(createAbortError()), { once: true });
          });
        }
      }
    });
    const windowSender = sender();
    const request = handlers.get(ipc.invoke.accountVideos)(
      { sender: windowSender },
      'PL1234567890'
    );
    await requested.promise;
    assert.equal(requestSignal.aborted, false);
    const rejected = assert.rejects(request, { name: 'AbortError' });
    await handlers.get(ipc.invoke.libraryCancel)({ sender: windowSender });
    await rejected;
    assert.equal(requestSignal.aborted, true);
    assert.equal(windowSender.listenerCount('destroyed'), 0);
  }
);

test(
  'closing the window aborts an in-flight account video listing without requiring disconnect',
  { timeout: 5000 },
  async () => {
    const requested = deferred();
    let requestSignal;
    const { handlers } = harness({
      account: {
        listVideos: ({ signal }) => {
          requestSignal = signal;
          requested.resolve();
          return new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(createAbortError()), { once: true });
          });
        }
      }
    });
    const windowSender = sender();
    const request = handlers.get(ipc.invoke.accountVideos)(
      { sender: windowSender },
      'PL1234567890'
    );
    await requested.promise;
    const rejected = assert.rejects(request, { name: 'AbortError' });
    windowSender.destroy();
    await rejected;
    assert.equal(requestSignal.aborted, true);
    assert.equal(windowSender.listenerCount('destroyed'), 0);
  }
);

test(
  'invalid batch video links are rejected before creating folders or preparing dependencies',
  { timeout: 5000 },
  async () => {
    const { handlers, calls, jobs } = harness();
    for (const url of [
      'https://youtube.com/playlist?list=PL1234567890',
      'https://youtube.com/watch?v=short',
      'https://youtube.com/feed/subscriptions',
      'https://user:secret@youtube.com/watch?v=BaW_jenozKc',
      'https://youtube.com:444/watch?v=BaW_jenozKc'
    ]) {
      await assert.rejects(
        handlers.get(ipc.invoke.downloadBatch)(
          { sender: sender() },
          {
            ...batchPayload,
            items: [{ url }]
          }
        )
      );
    }
    assert.equal(calls.mkdir, 0);
    assert.equal(calls.getYoutube, 0);
    assert.equal(calls.batch, 0);
    assert.equal(jobs.snapshot(), null);
  }
);
