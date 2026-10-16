const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const nodeCrypto = require('node:crypto');
const { prepareWindowsFfmpeg } = require('../scripts/prepare-ffmpeg.cjs');

const archive = Buffer.from('UEsDBBQAAAAIALZbUF1XwF18GQAAABcAAAAVAAAAZmZtcGVnL2Jpbi9mZm1wZWcuZXhlK0stykzLTE1RSEvLLUhNV0jLrCgpLUoFAFBLAQIUAxQAAAAIALZbUF1XwF18GQAAABcAAAAVAAAAAAAAAAAAAACAAQAAAABmZm1wZWcvYmluL2ZmbXBlZy5leGVQSwUGAAAAAAEAAQBDAAAATAAAAAAA', 'base64');
const binary = Buffer.from('verified ffmpeg fixture');
const sha = bytes => nodeCrypto.createHash('sha256').update(bytes).digest('hex');
async function fixture(t, overrides = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'prepare-ffmpeg-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify({
    source: 'https://example.test/ffmpeg.zip', archiveEntry: 'ffmpeg/bin/ffmpeg.exe',
    archiveSha256: sha(archive), sha256: sha(binary), ...overrides
  }));
  return { directory, cacheDirectory: path.join(directory, 'cache'), download: async (_url, file) => fs.writeFile(file, archive) };
}

test('restores a missing Windows binary from a verified ZIP without external unzip tools', async t => {
  const config = await fixture(t);
  assert.deepEqual(await fs.readFile(await prepareWindowsFfmpeg(config)), binary);
});

test('an already valid Windows binary needs no download or extraction', async t => {
  const config = await fixture(t);
  await fs.writeFile(path.join(config.directory, 'ffmpeg.exe'), binary);
  await prepareWindowsFfmpeg({ ...config, download: () => { throw new Error('unexpected network'); } });
});

test('rejects a modified archive before publishing a binary', async t => {
  const config = await fixture(t);
  await assert.rejects(prepareWindowsFfmpeg({ ...config, download: (_url, file) => fs.writeFile(file, 'modified archive') }), /archive FFmpeg invalide/);
  await assert.rejects(fs.stat(path.join(config.directory, 'ffmpeg.exe')), { code: 'ENOENT' });
});

test('replaces a corrupt archive cache with verified bytes', async t => {
  const config = await fixture(t);
  await fs.mkdir(config.cacheDirectory);
  await fs.writeFile(path.join(config.cacheDirectory, `${sha(archive)}.zip`), 'corrupt cache');
  assert.deepEqual(await fs.readFile(await prepareWindowsFfmpeg(config)), binary);
});

test('rejects an archive containing the wrong binary without replacing the existing file', async t => {
  const config = await fixture(t, { sha256: sha(Buffer.from('different binary')) });
  const destination = path.join(config.directory, 'ffmpeg.exe');
  await fs.writeFile(destination, 'existing binary');
  await assert.rejects(prepareWindowsFfmpeg(config), /binaire FFmpeg invalide/);
  assert.equal(await fs.readFile(destination, 'utf8'), 'existing binary');
});
