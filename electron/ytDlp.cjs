const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { pipeline } = require('node:stream');
const { promisify } = require('node:util');

const streamPipeline = promisify(pipeline);

const RELEASE_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';

function getDownloadUrl() {
  if (process.platform === 'win32') {
    return `${RELEASE_BASE}/yt-dlp.exe`;
  }

  if (process.platform === 'darwin') {
    return `${RELEASE_BASE}/yt-dlp_macos`;
  }

  return `${RELEASE_BASE}/yt-dlp`;
}

function getBinaryName() {
  return process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
}

async function downloadFile(url, destination) {
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });

  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.destroy();
        downloadFile(response.headers.location, destination).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Téléchargement yt-dlp impossible (HTTP ${response.statusCode})`));
        return;
      }

      const fileStream = fs.createWriteStream(destination);
      streamPipeline(response, fileStream)
        .then(resolve)
        .catch(reject);
    });

    request.on('error', reject);
  });
}

async function ensureYtDlp(userDataPath) {
  const targetPath = path.join(userDataPath, 'bin', getBinaryName());

  if (!fs.existsSync(targetPath)) {
    await downloadFile(getDownloadUrl(), targetPath);

    if (process.platform !== 'win32') {
      await fs.promises.chmod(targetPath, 0o755);
    }
  }

  return targetPath;
}

module.exports = {
  ensureYtDlp
};
