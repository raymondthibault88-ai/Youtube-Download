const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const contract = require('../shared/ipc.json');

function loadBridge() {
  let api;
  const renderer = new EventEmitter();
  renderer.invoke = async (channel, ...args) => ({ channel, args });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/preload.cjs'), 'utf8'), {
    require: (name) => {
      assert.equal(name, 'electron', 'A sandboxed preload can only load the Electron bridge.');
      return {
        ipcRenderer: renderer,
        contextBridge: {
          exposeInMainWorld: (name, exposed) => {
            assert.equal(name, 'desktopAPI');
            api = exposed;
          }
        }
      };
    }
  });
  return { api, renderer };
}

const invocations = {
  getStartupInfo: 'startupInfo',
  checkDependencies: 'depsCheck',
  analyzeVideo: 'videoAnalyze',
  cancelVideoAnalysis: 'videoCancelAnalyze',
  readClipboard: 'clipboardRead',
  selectVideoFile: 'dialogSelectVideo',
  selectOutputDir: 'dialogSelectOutput',
  startDownload: 'downloadStart',
  startConversion: 'conversionStart',
  getCurrentJob: 'jobCurrent',
  cancelJob: 'jobCancel',
  revealPath: 'revealPath',
  getUpdateState: 'updateCurrent',
  checkForUpdates: 'updateCheck',
  downloadUpdate: 'updateDownload',
  installUpdate: 'updateInstall',
  openUpdateRelease: 'updateOpenRelease'
};
const subscriptions = {
  onDownloadProgress: 'downloadProgress',
  onConversionProgress: 'conversionProgress',
  onJobUpdate: 'jobUpdate',
  onUpdateState: 'updateState'
};

test('every exposed preload method invokes its exact shared IPC channel and forwards its payload', async () => {
  const { api } = loadBridge();
  assert.deepEqual(
    Object.keys(api).sort(),
    [...Object.keys(invocations), ...Object.keys(subscriptions)].sort()
  );
  assert.deepEqual(Object.values(invocations).sort(), Object.keys(contract.invoke).sort());
  const takesArgument = new Set(['analyzeVideo', 'startDownload', 'startConversion', 'revealPath']);
  const payload = { inputPath: 'C:\\Vidéos\\Original é.mov', url: 'https://youtu.be/example' };
  for (const [method, key] of Object.entries(invocations)) {
    const args = takesArgument.has(method) ? [payload] : [];
    const result = await api[method](...args);
    assert.deepEqual(result, { channel: contract.invoke[key], args }, method);
  }
});

test('every preload subscription exposes only the payload and removes its own listener', () => {
  const { api, renderer } = loadBridge();
  assert.deepEqual(Object.values(subscriptions).sort(), Object.keys(contract.events).sort());
  for (const [method, key] of Object.entries(subscriptions)) {
    const payload = { percent: 42 };
    const calls = [];
    const unsubscribe = api[method]((...args) => calls.push(args));
    renderer.emit(contract.events[key], { sender: 'private IPC event' }, payload);
    assert.deepEqual(calls, [[payload]], method);
    assert.equal(renderer.listenerCount(contract.events[key]), 1);
    unsubscribe();
    assert.equal(renderer.listenerCount(contract.events[key]), 0);
    renderer.emit(contract.events[key], {}, payload);
    assert.equal(calls.length, 1);
  }
});
