const path = require('node:path');
const { fileURLToPath } = require('node:url');

const YOUTUBE_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
  'youtu.be', 'www.youtu.be'
]);

function validateYouTubeUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new Error('URL YouTube invalide.');
  }
  if (parsed.protocol !== 'https:' || !YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error('Utilise une URL HTTPS youtube.com ou youtu.be.');
  }
  return parsed.toString();
}

function requireAbsolutePath(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized || !path.isAbsolute(normalized)) throw new Error(`${label} invalide.`);
  return path.normalize(normalized);
}

function validateFormatId(value) {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(normalized)) throw new Error('Format vidéo invalide.');
  return normalized;
}

function isPathInside(basePath, candidatePath, pathApi = path) {
  const base = pathApi.resolve(basePath);
  const candidate = pathApi.resolve(candidatePath);
  const relative = pathApi.relative(base, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(relative));
}

function validateSender(event, { appPath, devOrigin }) {
  const frameUrl = event.senderFrame?.url || event.sender?.getURL?.() || '';
  try {
    const parsed = new URL(frameUrl);
    if (devOrigin && parsed.origin === devOrigin) return;
    if (parsed.protocol === 'file:' && isPathInside(appPath, fileURLToPath(parsed))) return;
  } catch {
    // Rejected below.
  }
  throw new Error('Émetteur IPC non autorisé.');
}

module.exports = { isPathInside, requireAbsolutePath, validateFormatId, validateSender, validateYouTubeUrl };
