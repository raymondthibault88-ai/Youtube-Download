const fs = require('node:fs');
const path = require('node:path');
const nodeCrypto = require('node:crypto');

const EXPECTED_SHA256 = '3256173f3f8bffd7df12227c68adf68025edb1832273a9530688a7bb1ed8edec';
const binaryPath = path.join(__dirname, '..', 'build', 'ffmpeg', 'win32-x64', 'ffmpeg.exe');

if (!fs.existsSync(binaryPath)) {
  throw new Error(`FFmpeg Windows x64 est absent : ${binaryPath}`);
}

const hash = nodeCrypto.createHash('sha256');
hash.update(fs.readFileSync(binaryPath));
const actualSha256 = hash.digest('hex');

if (actualSha256 !== EXPECTED_SHA256) {
  throw new Error(`Intégrité FFmpeg Windows invalide : ${actualSha256}`);
}

console.log(`FFmpeg Windows x64 vérifié (${actualSha256}).`);
