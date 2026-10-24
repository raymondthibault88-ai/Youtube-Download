const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const { setImmediate: tick } = require('node:timers/promises');
const { pathToFileURL } = require('node:url');
const { notifyRenderer } = require('../electron/services/notify-renderer.cjs');
const channels = require('../shared/ipc.json');

test('a live renderer receives the same channel and payload', () => {
  const payload = { percent: 45, raw: 'Progression' };
  let received;
  const target = {
    isDestroyed: () => false,
    send: (channel, value) => {
      received = { channel, value };
    }
  };
  assert.equal(notifyRenderer(target, channels.events.downloadProgress, payload), true);
  assert.equal(received.channel, channels.events.downloadProgress);
  assert.equal(received.value, payload);
});

test('absent or destroyed renderers are skipped without calling send', () => {
  let sends = 0;
  const target = { isDestroyed: () => true, send: () => sends++ };
  for (const value of [null, undefined, target])
    assert.equal(notifyRenderer(value, channels.events.jobUpdate, {}), false);
  assert.equal(sends, 0);
});

test('an unavailable renderer state or send operation cannot escape the notifier', () => {
  assert.equal(
    notifyRenderer(
      {
        isDestroyed: () => {
          throw new Error('Object was destroyed');
        }
      },
      channels.events.jobUpdate,
      {}
    ),
    false
  );
  assert.equal(
    notifyRenderer(
      {
        isDestroyed: () => false,
        send: () => {
          throw new Error('Render frame was disposed');
        }
      },
      channels.events.jobUpdate,
      {}
    ),
    false
  );
});

function loadHandlers(legacyChannel) {
  const source = path.resolve(__dirname, '../electron/ipc/register-handlers.cjs');
  const localRequire = createRequire(source);
  const applicationPath = path.resolve(__dirname, '..');
  const directory = path.resolve('virtual-notification-test');
  const inputPath = path.join(directory, 'Vidéo source é.mov');
  const outputPath = path.join(directory, 'Vidéo source é.mp4');
  const progress = { percent: 45, raw: 'Traitement', speed: '2x', eta: '1s' };
  const messages = [];
  const sender = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    getURL: () => pathToFileURL(path.join(applicationPath, 'dist', 'index.html')).href,
    send(channel, payload) {
      messages.push({ channel, payload });
      if (channel === legacyChannel) throw new Error('Render frame was disposed');
    }
  });
  const mediaInfo = {
    duration: 2,
    width: 1280,
    height: 720,
    codec: 'h264',
    hasAudio: true,
    audioCodec: 'aac'
  };
  const app = Object.assign(new EventEmitter(), {
    getAppPath: () => applicationPath,
    getPath: () => directory
  });
  const handlers = new Map();
  const sandbox = {
    module: { exports: {} },
    AbortController,
    require(name) {
      if (name === 'electron')
        return {
          clipboard: {},
          dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [inputPath] }) },
          shell: {}
        };
      if (name === 'node:fs')
        return {
          existsSync: () => true,
          promises: { mkdir: async () => {}, stat: async () => ({ size: 1024 }) }
        };
      if (name === '../services/media.cjs')
        return {
          buildOutputOptions: () => [],
          MediaService: class {
            async inspect() {
              return mediaInfo;
            }
            async convert({ onProgress }) {
              onProgress(progress);
              return outputPath;
            }
          }
        };
      if (name === '../services/youtube.cjs')
        return {
          YouTubeService: class {
            async download(_payload, _signal, onProgress) {
              onProgress(progress);
              return { ok: true, outputPath };
            }
          }
        };
      return localRequire(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), sandbox, { filename: source });
  const jobs = sandbox.module.exports.registerHandlers({
    app,
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    dependencyService: {
      getFfmpegInfo: async () => ({ ffmpegPath: 'fake' }),
      getYtDlpInfo: async () => ({ ytDlpPath: 'fake' })
    },
    updateService: { assertCanStartJob() {} }
  });
  return {
    jobs,
    messages,
    progress,
    directory,
    inputPath,
    invoke: (channel, payload) => handlers.get(channel)({ sender }, payload)
  };
}

for (const [operation, legacyChannel] of [
  ['conversion', channels.events.conversionProgress],
  ['download', channels.events.downloadProgress]
]) {
  test(`a failed legacy ${operation} notification cannot interrupt its IPC job`, async () => {
    const harness = loadHandlers(legacyChannel);
    let result;
    if (operation === 'conversion') {
      await harness.invoke(channels.invoke.dialogSelectVideo);
      result = await harness.invoke(channels.invoke.conversionStart, {
        inputPath: harness.inputPath,
        outputDir: harness.directory,
        profileId: 'fast'
      });
    } else {
      result = await harness.invoke(channels.invoke.downloadStart, {
        url: 'https://youtu.be/example',
        outputDir: harness.directory,
        formatId: '137',
        hasAudio: false
      });
    }
    assert.equal(result.ok, true);
    assert.equal(harness.jobs.snapshot().state, 'completed');
    const legacy = harness.messages.filter((message) => message.channel === legacyChannel);
    assert.equal(legacy.length, 1);
    assert.equal(legacy[0].payload, harness.progress);
    assert.ok(
      harness.messages.some(
        (message) =>
          message.channel === channels.events.jobUpdate && message.payload.state === 'completed'
      )
    );
  });
}

test('an unavailable window does not stop update notifications for another window', async () => {
  const source = path.resolve(__dirname, '../electron/main.cjs');
  const localRequire = createRequire(source);
  const received = [];
  let notify;
  const windows = [
    { isDestroyed: () => true },
    { isDestroyed: () => false, webContents: { isDestroyed: () => true } },
    {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: () => {
          throw new Error('Render frame was disposed');
        }
      }
    },
    {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: (channel, payload) => received.push({ channel, payload })
      }
    }
  ];
  const app = Object.assign(new EventEmitter(), {
    isPackaged: false,
    setAppUserModelId() {},
    enableSandbox() {},
    quit() {},
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve()
  });
  const sandbox = {
    process,
    setImmediate,
    module: { exports: {} },
    require(name) {
      if (name === 'electron')
        return {
          app,
          BrowserWindow: { getAllWindows: () => windows },
          Menu: { setApplicationMenu() {} },
          ipcMain: {},
          shell: {},
          session: {
            defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} }
          }
        };
      if (name === './services/updates.cjs')
        return {
          UpdateService: class {
            constructor(options) {
              notify = options.notify;
            }
            start() {}
          }
        };
      if (name === './services/dependencies.cjs')
        return {
          DependencyService: class {
            prewarm() {}
          }
        };
      if (name === './ipc/register-handlers.cjs')
        return { registerHandlers: () => ({ snapshot: () => null }) };
      if (name === './window.cjs') return { createMainWindow: () => new EventEmitter() };
      return localRequire(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), sandbox, { filename: source });
  await tick();
  const snapshot = { status: 'available', version: '5.1.3' };
  assert.doesNotThrow(() => notify(snapshot));
  assert.equal(received.length, 1);
  assert.equal(received[0].channel, channels.events.updateState);
  assert.equal(received[0].payload, snapshot);
});
