const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { setImmediate: tick } = require('node:timers/promises');
const { UpdateService, releasesUrl } = require('../electron/services/updates.cjs');

function setup(t, options = {}) {
  const resourcesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube-updates-'));
  fs.writeFileSync(path.join(resourcesPath, 'app-update.yml'), 'provider: github\n');
  t.after(() => fs.rmSync(resourcesPath, { recursive: true, force: true }));
  const updater = new EventEmitter();
  const calls = { checks: 0, downloads: 0, installs: [], opened: [] };
  const states = [];
  updater.checkForUpdates = async () => {
    calls.checks++;
    updater.emit('update-available', { version: '5.0.1' });
  };
  updater.downloadUpdate = async () => {
    calls.downloads++;
    updater.emit('update-downloaded', { version: '5.0.1' });
  };
  updater.quitAndInstall = (...args) => calls.installs.push(args);
  const service = new UpdateService({
    app: { isPackaged: true, getVersion: () => '5.0.0' },
    updater,
    resourcesPath,
    platform: 'win32',
    env: {},
    isBusy: () => false,
    notify: (state) => states.push(state),
    openExternal: async (url) => {
      calls.opened.push(url);
    },
    ...options
  });
  t.after(() => service.dispose());
  return { service, updater, calls, states };
}

test('development and unpacked apps never check, download or install updates', async (t) => {
  for (const options of [
    { app: { isPackaged: false, getVersion: () => '5.0.0' } },
    { resourcesPath: os.tmpdir() },
    { platform: 'linux' }
  ]) {
    const { service, calls } = setup(t, options);
    assert.equal(service.snapshot().status, 'disabled');
    service.start();
    await service.check();
    await assert.rejects(service.download());
    assert.throws(() => service.install());
    assert.deepEqual(calls, { checks: 0, downloads: 0, installs: [], opened: [] });
  }
});

test('portable Windows and ad hoc macOS offer manual updates; signed macOS enables installation', async (t) => {
  for (const options of [
    { env: { PORTABLE_EXECUTABLE_FILE: 'portable.exe' } },
    { env: { PORTABLE_EXECUTABLE_DIR: 'C:\\Portable' } },
    { platform: 'darwin', macSigned: () => false }
  ]) {
    const { service, calls } = setup(t, options);
    assert.equal(service.snapshot().mode, 'manual');
    await service.check();
    assert.equal(service.snapshot().version, '5.0.1');
    await assert.rejects(service.download());
    assert.throws(() => service.install());
    assert.equal(calls.downloads, 0);
  }
  assert.equal(
    setup(t, { platform: 'darwin', macSigned: () => true }).service.snapshot().mode,
    'automatic'
  );
});

test('an update is checked and downloaded only on request, then installed only after an explicit restart', async (t) => {
  const { service, updater, calls, states } = setup(t);
  assert.equal(updater.listenerCount('error'), 0);
  assert.throws(() => service.install());
  await service.check();
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowPrerelease, false);
  assert.equal(updater.allowDowngrade, false);
  assert.equal(updater.disableWebInstaller, true);
  assert.equal(service.snapshot().status, 'available');
  assert.equal(calls.downloads, 0);
  assert.throws(() => service.install());
  await service.download();
  assert.equal(service.snapshot().status, 'downloaded');
  await service.check();
  assert.equal(calls.checks, 1);
  assert.equal(calls.installs.length, 0);
  service.install();
  assert.throws(() => service.assertCanStartJob());
  assert.throws(() => service.install());
  await tick();
  assert.deepEqual(calls.installs, [[false, true]]);
  assert.deepEqual(
    states.map((state) => state.status),
    ['checking', 'available', 'downloading', 'downloaded', 'installing']
  );
});

test('an active media job prevents installation without discarding the downloaded update', async (t) => {
  let busy = true;
  const { service, calls } = setup(t, { isBusy: () => busy });
  await service.check();
  await service.download();
  assert.throws(() => service.install(), /fin du téléchargement ou de la conversion/);
  assert.equal(service.snapshot().status, 'downloaded');
  await tick();
  assert.equal(calls.installs.length, 0);
  busy = false;
  service.install();
  await tick();
  assert.equal(calls.installs.length, 1);
});

test('overlapping checks and downloads share the active operation and preserve progress', async (t) => {
  const { service, updater, calls } = setup(t);
  let finishCheck;
  updater.checkForUpdates = () => {
    calls.checks++;
    return new Promise((resolve) => {
      finishCheck = resolve;
    });
  };
  const checking = service.check();
  const alsoChecking = service.check();
  assert.equal(calls.checks, 1);
  updater.emit('update-available', { version: '5.0.1' });
  finishCheck();
  await Promise.all([checking, alsoChecking]);
  let finishDownload;
  updater.downloadUpdate = () => {
    calls.downloads++;
    return new Promise((resolve) => {
      finishDownload = resolve;
    });
  };
  const downloading = service.download();
  const alsoDownloading = service.download();
  const checkDuringDownload = service.check();
  updater.emit('download-progress', { percent: 48.5 });
  updater.emit('download-progress', { percent: Number.NaN });
  updater.emit('download-progress', { percent: 12 });
  assert.equal(service.snapshot().percent, 48.5);
  assert.equal(service.snapshot().status, 'downloading');
  updater.emit('update-downloaded', { version: '5.0.1' });
  finishDownload();
  await Promise.all([downloading, alsoDownloading, checkDuringDownload]);
  assert.equal(calls.downloads, 1);
  assert.equal(service.snapshot().status, 'downloaded');
});

test('a checksum or signature failure can never reach the install command and can be retried', async (t) => {
  const { service, updater, calls } = setup(t);
  await service.check();
  updater.downloadUpdate = async () => {
    const error = Object.assign(new Error('sha512 checksum mismatch'), {
      code: 'ERR_UPDATER_CHECKSUM_MISMATCH'
    });
    updater.emit('error', error);
    throw error;
  };
  await service.download();
  assert.equal(service.snapshot().status, 'error');
  assert.match(service.snapshot().error, /ne sera pas installée/);
  assert.throws(() => service.install());
  assert.equal(calls.installs.length, 0);
  await service.check();
  assert.equal(service.snapshot().status, 'available');
  assert.equal(service.snapshot().error, null);
});

test('network and missing release errors remain local to updates; a later check can succeed', async (t) => {
  const { service, updater } = setup(t);
  updater.checkForUpdates = async () => {
    throw new Error('net::ERR_INTERNET_DISCONNECTED');
  };
  await service.check();
  assert.match(service.snapshot().error, /connexion/);
  assert.doesNotThrow(() => service.assertCanStartJob());
  updater.checkForUpdates = async () => {
    throw Object.assign(new Error('No release'), { code: 'ERR_UPDATER_NO_PUBLISHED_VERSIONS' });
  };
  await service.check();
  assert.match(service.snapshot().error, /Aucune version publique/);
  updater.checkForUpdates = async () => updater.emit('update-not-available', { version: '5.0.0' });
  await service.check();
  assert.equal(service.snapshot().status, 'not-available');
  assert.equal(service.snapshot().error, null);
});

test('external navigation always uses the fixed project releases URL', async (t) => {
  const { service, calls } = setup(t);
  await service.openReleasePage('https://attacker.example/');
  assert.deepEqual(calls.opened, [releasesUrl]);
  assert.equal(releasesUrl, 'https://github.com/raymondthibault88-ai/Youtube-Download/releases');
  const snapshot = service.snapshot();
  snapshot.status = 'downloaded';
  assert.equal(service.snapshot().status, 'idle');
});

test('the updater factory and event configuration are deferred until the first check and initialized once', async (t) => {
  let initialized = 0;
  const { service, updater } = setup(t, {
    createUpdater: () => {
      initialized += 1;
      return updater;
    }
  });
  assert.equal(initialized, 0);
  assert.equal(service.snapshot().status, 'idle');
  assert.equal(updater.autoDownload, undefined);
  service.start();
  assert.equal(initialized, 0);
  await Promise.all([service.check(), service.check()]);
  assert.equal(initialized, 1);
  assert.equal(updater.listenerCount('error'), 1);
  assert.equal(updater.listenerCount('update-available'), 1);
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowPrerelease, false);
  assert.equal(updater.allowDowngrade, false);
  assert.equal(updater.disableWebInstaller, true);
  await service.check();
  await service.download();
  assert.equal(initialized, 1);
});

test('disabled configurations never instantiate an updater, even when explicitly checked or disposed', async (t) => {
  let initialized = 0;
  for (const options of [
    { app: { isPackaged: false, getVersion: () => '5.1.1' } },
    { platform: 'linux' },
    { resourcesPath: path.join(os.tmpdir(), 'missing-update-resources') }
  ]) {
    const { service } = setup(t, {
      ...options,
      createUpdater: () => {
        initialized += 1;
        throw new Error('Must not load');
      }
    });
    service.start();
    assert.equal((await service.check()).status, 'disabled');
    service.dispose();
    await service.check();
  }
  assert.equal(initialized, 0);
});

test('the automatic startup check first initializes its updater after eight seconds', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let initialized = 0;
  const { service, updater, calls } = setup(t, {
    createUpdater: () => {
      initialized += 1;
      return updater;
    }
  });
  service.start();
  t.mock.timers.tick(7999);
  assert.equal(initialized, 0);
  assert.equal(calls.checks, 0);
  t.mock.timers.tick(1);
  await tick();
  assert.equal(initialized, 1);
  assert.equal(calls.checks, 1);
  assert.equal(service.snapshot().status, 'available');
});

test('a failed lazy initialization reports an update error and can retry without duplicate listeners', async (t) => {
  let attempts = 0;
  const { service, updater } = setup(t, {
    createUpdater: () => {
      attempts += 1;
      if (attempts === 1) throw new Error('Temporary module load error');
      return updater;
    }
  });
  await service.check();
  assert.equal(service.snapshot().status, 'error');
  assert.match(service.snapshot().error, /mise à jour/);
  assert.doesNotThrow(() => service.assertCanStartJob());
  await service.check();
  assert.equal(service.snapshot().status, 'available');
  assert.equal(service.snapshot().error, null);
  assert.equal(attempts, 2);
  assert.equal(updater.listenerCount('update-available'), 1);
});

test('disposing before the startup timer prevents delayed initialization and future checks', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let initialized = 0;
  const { service, updater } = setup(t, {
    createUpdater: () => {
      initialized += 1;
      return updater;
    }
  });
  service.start();
  service.dispose();
  t.mock.timers.tick(8000);
  await tick();
  await service.check();
  service.start();
  assert.equal(initialized, 0);
  assert.equal(service.snapshot().status, 'idle');
});

test('shutdown absorbs late updater errors without changing the last snapshot and then removes its listeners', async (t) => {
  const { service, updater, states } = setup(t);
  let finish;
  updater.checkForUpdates = () =>
    new Promise((_resolve, reject) => {
      finish = reject;
    });
  const checking = service.check();
  const before = service.snapshot();
  const notifications = states.length;
  service.dispose();
  assert.doesNotThrow(() => updater.emit('error', new Error('Network disconnected during quit')));
  updater.emit('update-available', { version: '5.9.0' });
  finish(new Error('Request rejected after app shutdown'));
  await checking;
  assert.deepEqual(service.snapshot(), before);
  assert.equal(states.length, notifications);
  assert.equal(updater.listenerCount('error'), 0);
  assert.equal(updater.listenerCount('update-available'), 0);
  await assert.rejects(service.download(), /fermeture/);
  assert.throws(() => service.install(), /fermeture/);
});

test('a queued update installation does not run after the app has already begun shutting down', async (t) => {
  const { service, calls } = setup(t);
  await service.check();
  await service.download();
  service.install();
  service.dispose();
  await tick();
  assert.equal(calls.installs.length, 0);
});

test('the development main process loads its window and disables the menu without importing electron-updater', async () => {
  const source = path.resolve(__dirname, '../electron/main.cjs');
  const localRequire = createRequire(source);
  const sequence = [];
  let updaterImports = 0;
  const app = Object.assign(new EventEmitter(), {
    isPackaged: false,
    getVersion: () => '5.1.1',
    setAppUserModelId() {},
    enableSandbox() {},
    requestSingleInstanceLock: () => true,
    quit() {},
    whenReady() {
      sequence.push('ready');
      return Promise.resolve();
    }
  });
  const fakeElectron = {
    app,
    BrowserWindow: { getAllWindows: () => [] },
    Menu: {
      setApplicationMenu(value) {
        assert.equal(value, null);
        sequence.push('menu');
      }
    },
    ipcMain: {},
    shell: {},
    session: {
      defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} }
    }
  };
  const sandbox = {
    process,
    setImmediate,
    module: { exports: {} },
    require(name) {
      if (name === 'electron') return fakeElectron;
      if (name === 'electron-updater') {
        updaterImports += 1;
        throw new Error('Development must not load updater');
      }
      if (name === './services/dependencies.cjs')
        return {
          DependencyService: class {
            prewarm() {}
          }
        };
      if (name === './ipc/register-handlers.cjs')
        return { registerHandlers: () => ({ snapshot: () => null }) };
      if (name === './window.cjs')
        return {
          createMainWindow: () => {
            sequence.push('window');
            return new EventEmitter();
          }
        };
      return localRequire(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), sandbox, { filename: source });
  await tick();
  assert.equal(updaterImports, 0);
  assert.deepEqual(sequence, ['menu', 'ready', 'window']);
  app.emit('before-quit', { preventDefault() {} });
});
