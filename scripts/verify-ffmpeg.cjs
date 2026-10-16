const fs = require('node:fs');
const path = require('node:path');
const nodeCrypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { machOCodeHash } = require('../electron/services/executable-integrity.cjs');

for (const target of ['darwin-arm64', 'darwin-x64', 'win32-x64']) {
  const dir = path.join(__dirname, '..', 'build', 'ffmpeg', target);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const binary = path.join(dir, target.startsWith('win32') ? 'ffmpeg.exe' : 'ffmpeg');
  const hash = nodeCrypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
  if (manifest.sha256 !== hash || manifest.nonfree !== false || !manifest.license || !manifest.sourceCode) throw new Error(`FFmpeg ${target} invalide.`);
  if (manifest.platform === 'darwin' && manifest.codeSha256 !== machOCodeHash(fs.readFileSync(binary))) throw new Error(`Code FFmpeg ${target} invalide.`);
  if (!fs.existsSync(path.join(dir, 'LICENSE.txt'))) throw new Error(`Licence FFmpeg ${target} absente.`);
  if (target === `${process.platform}-${process.arch}`) {
    const license = execFileSync(binary, ['-L'], { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] });
    const version = execFileSync(binary, ['-version'], { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] });
    if (/nonfree|not legally redistributable/i.test(license + version)) throw new Error(`FFmpeg ${target} non redistribuable.`);
  }
  console.log(`FFmpeg ${target} vérifié (${hash}).`);
}
