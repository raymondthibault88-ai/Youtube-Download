const nodeCrypto = require('node:crypto');

function sha256(bytes) {
  return nodeCrypto.createHash('sha256').update(bytes).digest('hex');
}

// macOS re-signs embedded tools. Hash all their code/data, excluding only the
// signature blob and the load-command sizes which codesign necessarily changes.
function machOCodeHash(bytes) {
  if (bytes.length < 32 || bytes.readUInt32LE(0) !== 0xfeedfacf) throw new Error('Exécutable Mach-O 64 bits invalide.');
  const headerEnd = 32 + bytes.readUInt32LE(20);
  const commands = bytes.readUInt32LE(16);
  if (headerEnd > bytes.length || commands > 4096) throw new Error('En-tête Mach-O invalide.');
  const normalized = Buffer.from(bytes);
  let offset = 32;
  let signatureOffset = null;
  for (let index = 0; index < commands; index += 1) {
    if (offset + 8 > headerEnd) throw new Error('Commande Mach-O invalide.');
    const command = bytes.readUInt32LE(offset);
    const size = bytes.readUInt32LE(offset + 4);
    if (size < 8 || offset + size > headerEnd) throw new Error('Taille Mach-O invalide.');
    if (command === 0x1d) {
      if (size !== 16 || signatureOffset !== null) throw new Error('Signature Mach-O invalide.');
      signatureOffset = bytes.readUInt32LE(offset + 8);
      const signatureSize = bytes.readUInt32LE(offset + 12);
      if (signatureOffset < headerEnd || signatureOffset + signatureSize !== bytes.length) throw new Error('Signature Mach-O hors limites.');
      normalized.fill(0, offset + 8, offset + 16);
    }
    if (command === 0x19) {
      if (size < 72) throw new Error('Segment Mach-O invalide.');
      const name = bytes.toString('utf8', offset + 8, offset + 24).replace(/\0/g, '');
      if (name === '__LINKEDIT') {
        normalized.fill(0, offset + 32, offset + 40); // vmsize
        normalized.fill(0, offset + 48, offset + 56); // filesize
      }
    }
    offset += size;
  }
  if (offset !== headerEnd || signatureOffset === null) throw new Error('Signature Mach-O manquante.');
  return sha256(normalized.subarray(0, signatureOffset));
}

function verifyExecutable(bytes, manifest, { allowMacSigning = false } = {}) {
  if (sha256(bytes) === manifest.sha256) return true;
  return allowMacSigning && manifest.platform === 'darwin' && typeof manifest.codeSha256 === 'string' && machOCodeHash(bytes) === manifest.codeSha256;
}

module.exports = { sha256, machOCodeHash, verifyExecutable };
