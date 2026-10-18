const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowPrerelease, false);
  assert.equal(updater.allowDowngrade, false);
  assert.equal(updater.disableWebInstaller, true);
  assert.throws(() => service.install());
  await service.check();
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
