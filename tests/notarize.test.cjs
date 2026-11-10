const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup({
  env = {},
  authority = 'Developer ID Application: Example',
  team = 'EXAMPLETEAM',
  failure
} = {}) {
  const calls = [];
  const module = { exports: {} };
  const run = (command, args) => {
    calls.push([command, args]);
    return Buffer.alloc(0);
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/notarize.cjs'), 'utf8'), {
    module,
    process: { env },
    console: { log() {} },
    require(name) {
      if (name === 'node:path') return path;
      if (name === 'node:child_process')
        return {
          execFileSync: run,
          spawnSync: () => ({
            status: 0,
            stderr: `Authority=${authority}\nTeamIdentifier=${team}\n`
          })
        };
      if (name === '@electron/notarize')
        return {
          notarize: async (options) => {
            calls.push(['notarize', options]);
            if (failure) throw failure;
          }
        };
      throw new Error(name);
    }
  });
  const context = {
    electronPlatformName: 'darwin',
    appOutDir: '/build',
    packager: { appInfo: { productFilename: 'YouTube Downloader' } }
  };
  return { run: () => module.exports(context), calls, context, hook: module.exports };
}
const env = {
  MAC_AUTO_UPDATE_REQUIRED: 'true',
  APPLE_ID: 'developer@example.invalid',
  APPLE_APP_SPECIFIC_PASSWORD: 'test-only',
  APPLE_TEAM_ID: 'EXAMPLETEAM'
};

test('official Mac builds reject missing notarization credentials', async () => {
  const harness = setup({ env: { MAC_AUTO_UPDATE_REQUIRED: 'true' } });
  await assert.rejects(harness.run(), /identifiants/);
  assert.equal(harness.calls.length, 0);
});
for (const options of [{ authority: 'Apple Development: Example' }, { team: 'WRONGTEAM' }])
  test('official Mac builds reject development certificates or the wrong team', async () => {
    const harness = setup({ env, ...options });
    await assert.rejects(harness.run(), /Developer ID/);
    assert.equal(harness.calls.length, 0);
  });
test('official Mac builds verify, notarize once and validate the stapled ticket', async () => {
  const harness = setup({ env });
  await harness.run();
  assert.deepEqual(
    harness.calls.map(([name]) => name),
    ['/usr/bin/codesign', 'notarize', '/usr/bin/xcrun']
  );
  assert.equal(harness.calls[1][1].teamId, env.APPLE_TEAM_ID);
  assert.deepEqual(Array.from(harness.calls[2][1]), [
    'stapler',
    'validate',
    '/build/YouTube Downloader.app'
  ]);
});
test('notarization failure stops the build before ticket validation', async () => {
  const harness = setup({ env, failure: new Error('Apple rejected this build') });
  await assert.rejects(harness.run(), /Apple rejected/);
  assert.equal(
    harness.calls.some(([name]) => name === '/usr/bin/xcrun'),
    false
  );
});
test('local builds without Apple credentials keep the manual-update path', async () => {
  const harness = setup();
  await harness.run();
  assert.deepEqual(
    harness.calls.map(([name]) => name),
    ['/usr/bin/codesign']
  );
});
test('Windows builds do not run Mac signing operations', async () => {
  const harness = setup({ env });
  await harness.hook({ ...harness.context, electronPlatformName: 'win32' });
  assert.equal(harness.calls.length, 0);
});
