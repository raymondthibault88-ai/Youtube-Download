const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  downloadGitHubAsset,
  verifyFileHash
} = require('../electron/services/verified-download.cjs');

test('a verified binary must match its pinned SHA-256', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'verified-download-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const executable = path.join(directory, 'binary');
  const digest = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  await fs.writeFile(executable, 'abc');
  await verifyFileHash(executable, digest, 'FFmpeg');
  await fs.writeFile(executable, 'different');
  await assert.rejects(verifyFileHash(executable, digest, 'FFmpeg'), /SHA256 mismatch/);
});

test('binary downloads require HTTPS on trusted GitHub hosts', async () => {
  for (const url of ['http://github.com/asset', 'https://github.com.example.invalid/asset']) {
    await assert.rejects(downloadGitHubAsset(url, 'unused-path', 'FFmpeg'), /hôte non autorisé/);
  }
});
