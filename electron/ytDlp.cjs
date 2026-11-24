const fs = require('node:fs');
const path = require('node:path');
const nodeCrypto = require('node:crypto');
const { downloadGitHubAsset, verifyFileHash } = require('./services/verified-download.cjs');

const ensureBinaryPromises = new Map();

const RELEASE_VERSION = '2026.11.23';
const RELEASE_BASE = `https://github.com/yt-dlp/yt-dlp/releases/download/${RELEASE_VERSION}`;
const BINARIES_BY_PLATFORM = {
  win32: {
    name: 'yt-dlp.exe',
    sha256: '622ed48023cac1daa52a3bf3a6ac38f03514de214b5f0fa069389fd0f6d17e5c'
  },
  darwin: {
    name: 'yt-dlp_macos',
    sha256: '57654854886d0398a798895aadf5173e2749fbb5e249b9f3728022ab376e11fb'
  },
  linux: {
    name: 'yt-dlp',
    sha256: 'e8665ed64d6b9172773e812f891fb707a0cb1ee8d9ef4fc1acb00cabee4c5256'
  }
};

const BINARY_INFO = BINARIES_BY_PLATFORM[process.platform];
if (!BINARY_INFO) {
  throw new Error(`Plateforme non supportée pour yt-dlp: ${process.platform}`);
}

async function removeIfExists(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function downloadAndVerifyBinary(binaryInfo, targetPath) {
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.${nodeCrypto.randomBytes(6).toString('hex')}.download`;

  try {
    await downloadGitHubAsset(`${RELEASE_BASE}/${binaryInfo.name}`, tempPath, 'yt-dlp');
    await verifyFileHash(tempPath, binaryInfo.sha256, 'yt-dlp');
    await fs.promises.rename(tempPath, targetPath);

    if (process.platform !== 'win32') {
      await fs.promises.chmod(targetPath, 0o755);
    }
  } finally {
    await removeIfExists(tempPath);
  }
}

async function ensureYtDlp(userDataPath) {
  const targetPath = path.join(userDataPath, 'bin', BINARY_INFO.name);
  const existingEnsurePromise = ensureBinaryPromises.get(targetPath);
  if (existingEnsurePromise) {
    return existingEnsurePromise;
  }

  const ensurePromise = (async () => {
    if (fs.existsSync(targetPath)) {
      try {
        await verifyFileHash(targetPath, BINARY_INFO.sha256, 'yt-dlp');
        return targetPath;
      } catch {
        await removeIfExists(targetPath);
      }
    }

    await downloadAndVerifyBinary(BINARY_INFO, targetPath);

    return targetPath;
  })();

  ensureBinaryPromises.set(targetPath, ensurePromise);

  try {
    return await ensurePromise;
  } finally {
    if (ensureBinaryPromises.get(targetPath) === ensurePromise) {
      ensureBinaryPromises.delete(targetPath);
    }
  }
}

module.exports = {
  ensureYtDlp,
  RELEASE_VERSION
};
