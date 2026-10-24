const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { setImmediate: tick } = require('node:timers/promises');

function setup({ ensure, run, exists = true } = {}) {
  const source = path.resolve(__dirname, '../electron/services/dependencies.cjs');
  const localRequire = createRequire(source);
  const calls = { ensure: [], processes: [] };
  const ytDlpPath = path.resolve('verified-bin', 'yt-dlp.exe');
  const ffmpegPath = path.resolve('bundled-bin', 'ffmpeg.exe');
  const userDataPath = path.resolve('user-data');
  const downloadsPath = path.resolve('downloads');
  const pinnedVersion = '2099.01.01';
  const sandbox = {
    Date,
    module: { exports: {} },
    require(name) {
      if (name === 'node:fs') return { existsSync: () => exists };
      if (name === 'ffmpeg-static') return ffmpegPath;
      if (name === '../ytDlp.cjs')
        return {
          RELEASE_VERSION: pinnedVersion,
          ensureYtDlp: async (directory) => {
            calls.ensure.push(directory);
            return ensure ? ensure(directory) : ytDlpPath;
          }
        };
      if (name === './process-runner.cjs')
        return {
          runProcess: async (command, args) => {
            calls.processes.push({ command, args: [...args] });
            return run
              ? run(command, args)
              : { stdout: 'ffmpeg version tested-build\nconfiguration: ...' };
          }
        };
      return localRequire(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), sandbox, { filename: source });
  const service = new sandbox.module.exports.DependencyService({
    getPath: (kind) => (kind === 'userData' ? userDataPath : downloadsPath)
  });
  return { service, calls, ytDlpPath, ffmpegPath, pinnedVersion, userDataPath, downloadsPath };
}

test('yt-dlp preparation waits for integrity verification and reports the exact pinned release without launching --version', async () => {
  let verified;
  const validation = new Promise((resolve) => {
    verified = resolve;
  });
  const { service, calls, ytDlpPath, pinnedVersion, userDataPath } = setup({
    ensure: () => validation
  });
  let resolved = false;
  const first = service.getYtDlpInfo().then((value) => {
    resolved = true;
    return value;
  });
  const second = service.getYtDlpInfo();
  await tick();
  assert.equal(resolved, false);
  assert.deepEqual(calls.ensure, [userDataPath]);
  assert.equal(calls.processes.length, 0);
  verified(ytDlpPath);
  const [info, shared] = await Promise.all([first, second]);
  assert.equal(info, shared);
  assert.equal(info.ytDlpPath, ytDlpPath);
  assert.equal(info.ytDlpVersion, pinnedVersion);
  assert.equal(await service.getYtDlpInfo(), info);
  assert.equal(calls.ensure.length, 1);
  assert.equal(calls.processes.length, 0);
});

test('a failed integrity check cannot populate the cache and a later attempt verifies again', async () => {
  let attempts = 0;
  const { service, calls, ytDlpPath } = setup({
    ensure: () => {
      attempts += 1;
      if (attempts === 1) throw new Error('SHA256 mismatch');
      return path.resolve('verified-bin', 'yt-dlp.exe');
    }
  });
  const rejected = await Promise.allSettled([service.getYtDlpInfo(), service.getYtDlpInfo()]);
  assert.equal(
    rejected.every((result) => result.status === 'rejected'),
    true
  );
  assert.equal(calls.ensure.length, 1);
  assert.equal(service.ytDlpInfo, null);
  const info = await service.getYtDlpInfo();
  assert.equal(info.ytDlpPath, ytDlpPath);
  assert.equal(calls.ensure.length, 2);
  assert.equal(calls.processes.length, 0);
});

test('renderer checks and main prewarming share one integrity check and the unchanged FFmpeg execution check', async () => {
  const { service, calls, ffmpegPath, downloadsPath, pinnedVersion } = setup();
  const [prepared, checked] = await Promise.all([
    service.prewarm(),
    service.getInfo(),
    service.getYtDlpInfo(),
    service.getFfmpegInfo()
  ]);
  assert.equal(prepared, checked);
  assert.equal(checked.ytDlpVersion, pinnedVersion);
  assert.equal(checked.ffmpegVersion, 'ffmpeg version tested-build');
  assert.equal(checked.downloadsPath, downloadsPath);
  assert.equal(calls.ensure.length, 1);
  assert.deepEqual(calls.processes, [{ command: ffmpegPath, args: ['-version'] }]);
  assert.equal(await service.getInfo(), checked);
  assert.equal(calls.processes.length, 1);
});

test('prewarming errors remain retryable while a missing FFmpeg still fails before any process starts', async () => {
  let attempts = 0;
  const first = setup({
    ensure: () => {
      attempts += 1;
      if (attempts === 1) throw new Error('Temporary verification error');
      return path.resolve('verified-bin', 'yt-dlp.exe');
    }
  });
  assert.equal(await first.service.prewarm(), null);
  assert.ok((await first.service.getInfo()).ytDlpVersion);
  assert.equal(first.calls.ensure.length, 2);
  assert.equal(first.calls.processes.length, 1);
  const missing = setup({ exists: false });
  await assert.rejects(missing.service.getFfmpegInfo(), /FFmpeg est introuvable/);
  assert.equal(missing.calls.processes.length, 0);
});
