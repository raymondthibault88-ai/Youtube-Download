const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { createHash } = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;

async function verifyFileHash(filePath, expectedSha256, component) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  if (hash.digest('hex') !== expectedSha256)
    throw new Error(`Intégrité ${component} invalide (SHA256 mismatch).`);
}

async function downloadGitHubAsset(url, destination, component, redirectCount = 0) {
  if (redirectCount > MAX_REDIRECTS)
    throw new Error(`Téléchargement ${component} interrompu après ${MAX_REDIRECTS} redirections.`);

  const { hostname, protocol } = new URL(url);
  if (
    protocol !== 'https:' ||
    (hostname !== 'github.com' && !hostname.endsWith('.githubusercontent.com'))
  )
    throw new Error(`Téléchargement ${component} bloqué sur un hôte non autorisé.`);

  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: DOWNLOAD_TIMEOUT_MS }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.destroy();
        const nextUrl = new URL(response.headers.location, url).toString();
        downloadGitHubAsset(nextUrl, destination, component, redirectCount + 1).then(
          resolve,
          reject
        );
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Téléchargement ${component} impossible (HTTP ${response.statusCode}).`));
        return;
      }

      const sizeError = new Error(`Téléchargement ${component} trop volumineux.`);
      if (Number(response.headers['content-length'] || 0) > MAX_DOWNLOAD_BYTES) {
        response.destroy();
        reject(sizeError);
        return;
      }
      let receivedBytes = 0;
      const sizeGuard = new Transform({
        transform(chunk, _encoding, callback) {
          receivedBytes += chunk.length;
          callback(receivedBytes > MAX_DOWNLOAD_BYTES ? sizeError : null, chunk);
        }
      });
      pipeline(response, sizeGuard, fs.createWriteStream(destination)).then(resolve, reject);
    });
    request.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
      request.destroy(
        new Error(`Téléchargement ${component} interrompu après ${DOWNLOAD_TIMEOUT_MS} ms.`)
      );
    });
    request.on('error', reject);
  });
}

module.exports = { downloadGitHubAsset, verifyFileHash };
