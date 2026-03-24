const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const nodeCrypto = require('node:crypto');
const { pipeline } = require('node:stream');
const { promisify } = require('node:util');

const streamPipeline = promisify(pipeline);
const ensureBinaryPromises = new Map();

const RELEASE_VERSION = '2026.03.17';
const RELEASE_BASE = `https://github.com/yt-dlp/yt-dlp/releases/download/${RELEASE_VERSION}`;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;
const BINARIES_BY_PLATFORM = {
  win32: {
    name: 'yt-dlp.exe',
    sha256: '3db811b366b2da47337d2fcfdfe5bbd9a258dad3f350c54974f005df115a1545'
  },
  darwin: {
    name: 'yt-dlp_macos',
    sha256: 'e80c47b3ce712acee51d5e3d4eace2d181b44d38f1942c3a32e3c7ff53cd9ed5'
  },
  linux: {
    name: 'yt-dlp',
    sha256: '3bda0968a01cde70d26720653003b28553c71be14dcb2e5f4c24e9921fdad745'
  }
};

const BINARY_INFO = BINARIES_BY_PLATFORM[process.platform];
if (!BINARY_INFO) {
  throw new Error(`Plateforme non supportée pour yt-dlp: ${process.platform}`);
}

function getDownloadUrl(binaryName) {
  return `${RELEASE_BASE}/${binaryName}`;
}

async function hashFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = nodeCrypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function verifyFileHash(filePath, expectedSha256) {
  const actualSha256 = await hashFileSha256(filePath);
  if (actualSha256 !== expectedSha256) {
    throw new Error('Intégrité yt-dlp invalide (SHA256 mismatch).');
  }
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

async function downloadFile(url, destination, redirectCount = 0) {
  if (redirectCount > MAX_REDIRECTS) {
    throw new Error(`Téléchargement yt-dlp interrompu: trop de redirections (${MAX_REDIRECTS}).`);
  }

  await fs.promises.mkdir(path.dirname(destination), { recursive: true });

  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: DOWNLOAD_TIMEOUT_MS }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.destroy();
        const nextUrl = new URL(response.headers.location, url).toString();
        downloadFile(nextUrl, destination, redirectCount + 1).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Téléchargement yt-dlp impossible (HTTP ${response.statusCode})`));
        return;
      }

      const fileStream = fs.createWriteStream(destination);
      streamPipeline(response, fileStream)
        .then(resolve)
        .catch(reject);
    });

    request.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
      request.destroy(new Error(`Téléchargement yt-dlp timeout après ${DOWNLOAD_TIMEOUT_MS}ms.`));
    });
    request.on('error', reject);
  });
}

async function downloadAndVerifyBinary(binaryInfo, targetPath) {
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.${nodeCrypto.randomBytes(6).toString('hex')}.download`;

  try {
    await downloadFile(getDownloadUrl(binaryInfo.name), tempPath);
    await verifyFileHash(tempPath, binaryInfo.sha256);
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
        await verifyFileHash(targetPath, BINARY_INFO.sha256);
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
  ensureYtDlp
};
