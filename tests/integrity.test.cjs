const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { machOCodeHash, verifyExecutable } = require('../electron/services/executable-integrity.cjs');

test('macOS signature metadata can change while executable code remains verified', () => {
  const dir = path.join(__dirname, '..', 'build', 'ffmpeg', 'darwin-arm64');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json')));
  const original = fs.readFileSync(path.join(dir, 'ffmpeg'));
  assert.equal(machOCodeHash(original), manifest.codeSha256);
  let offset = 32;
  let signature;
  for (let i = 0; i < original.readUInt32LE(16); i += 1) {
    if (original.readUInt32LE(offset) === 0x1d) signature = original.readUInt32LE(offset + 8);
    offset += original.readUInt32LE(offset + 4);
  }
  const resigned = Buffer.from(original);
  resigned[signature + 10] ^= 1;
  assert.equal(verifyExecutable(resigned, manifest), false);
  assert.equal(verifyExecutable(resigned, manifest, { allowMacSigning: true }), true);
  const modifiedCode = Buffer.from(resigned);
  modifiedCode[4096] ^= 1;
  assert.equal(verifyExecutable(modifiedCode, manifest, { allowMacSigning: true }), false);
  assert.throws(() => machOCodeHash(Buffer.alloc(32)), /invalide/);
});
