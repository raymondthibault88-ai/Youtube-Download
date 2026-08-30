const fs = require('node:fs');
const path = require('node:path');
const nodeCrypto = require('node:crypto');

const EXPECTED_SHA256 = '04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00';
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
