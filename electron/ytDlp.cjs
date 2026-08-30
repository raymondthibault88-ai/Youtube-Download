const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const nodeCrypto = require('node:crypto');
const { pipeline } = require('node:stream');
const { Transform } = require('node:stream');
const { promisify } = require('node:util');

const streamPipeline = promisify(pipeline);
const ensureBinaryPromises = new Map();

const RELEASE_VERSION = '2026.08.19';
const RELEASE_BASE = `https://github.com/yt-dlp/yt-dlp/releases/download/${RELEASE_VERSION}`;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;
const BINARIES_BY_PLATFORM = {
  win32: {
    name: 'yt-dlp.exe',
    sha256: '66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a'
  },
  darwin: {
    name: 'yt-dlp_macos',
    sha256: '0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202'
  },
  linux: {
    name: 'yt-dlp',
    sha256: '1fa6733c37ea6fb51c99ad8fe785e7b7e5f3246c9b980230329d4fb72ed8d4d6'
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

  const parsedUrl = new URL(url);
  const trustedHost = parsedUrl.hostname === 'github.com' || parsedUrl.hostname.endsWith('.githubusercontent.com');
  if (parsedUrl.protocol !== 'https:' || !trustedHost) {
    throw new Error('Téléchargement yt-dlp bloqué: hôte non autorisé.');
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

      const announcedSize = Number(response.headers['content-length'] || 0);
      if (announcedSize > MAX_DOWNLOAD_BYTES) {
        response.destroy();
        reject(new Error('Téléchargement yt-dlp trop volumineux.'));
        return;
      }

      const fileStream = fs.createWriteStream(destination);
      let receivedBytes = 0;
      const sizeGuard = new Transform({
        transform(chunk, _encoding, callback) {
          receivedBytes += chunk.length;
          callback(receivedBytes > MAX_DOWNLOAD_BYTES ? new Error('Téléchargement yt-dlp trop volumineux.') : null, chunk);
        }
      });
      streamPipeline(response, sizeGuard, fileStream)
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
