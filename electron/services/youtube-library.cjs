const { allowedHosts } = require('../../shared/youtube-config.json');
const { createAbortError, runProcess } = require('./process-runner.cjs');

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{2,150}$/;
const CHANNEL_TABS = new Set(['videos', 'shorts', 'streams']);
const { maxImportItems: MAX_ITEMS } = require('../../shared/library-config.json');

function normalizeLibrarySource(source) {
  let parsed;
  try {
    parsed = new URL(String(source || '').trim());
  } catch {
    throw new Error('Collez le lien YouTube d’une playlist ou d’une chaîne.');
  }
  if (
    parsed.protocol !== 'https:' ||
    !allowedHosts.includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    throw new Error('Utilisez un lien HTTPS provenant de youtube.com ou youtu.be.');
  }
  const parts = parsed.pathname.split('/').filter(Boolean);
  const playlistId = parsed.searchParams.get('list');
  if (
    playlistId &&
    (['playlist', 'watch'].includes(parts[0]) ||
      (parsed.hostname.endsWith('youtu.be') && VIDEO_ID.test(parts[0] || '')))
  ) {
    if (!PLAYLIST_ID.test(playlistId))
      throw new Error('L’identifiant de cette playlist est invalide.');
    return {
      kind: 'playlist',
      url: `https://www.youtube.com/playlist?list=${playlistId}`
    };
  }
  if (parsed.hostname.endsWith('youtu.be')) {
    throw new Error('Ce lien désigne une vidéo. Collez le lien de sa playlist ou de sa chaîne.');
  }
  let decoded;
  try {
    decoded = parts.map((part) => decodeURIComponent(part));
  } catch {
    throw new Error('Le lien de cette chaîne est invalide.');
  }
  const isHandle = /^@[^\s/@?#\\]{1,100}$/u.test(decoded[0] || '');
  const isNamedChannel =
    ['channel', 'user', 'c'].includes(decoded[0]) && /^[^\s/@?#\\]{1,100}$/u.test(decoded[1] || '');
  const tabIndex = isHandle ? 1 : 2;
  if (
    (!isHandle && !isNamedChannel) ||
    decoded.length > tabIndex + 1 ||
    (decoded[tabIndex] && !CHANNEL_TABS.has(decoded[tabIndex]))
  ) {
    throw new Error('Collez le lien d’une playlist ou d’une chaîne YouTube.');
  }
  const channelPath = isHandle
    ? `@${encodeURIComponent(decoded[0].slice(1))}`
    : `${decoded[0]}/${encodeURIComponent(decoded[1])}`;
  return {
    kind: 'channel',
    url: `https://www.youtube.com/${channelPath}/${decoded[tabIndex] || 'videos'}`
  };
}

function videoIdFromEntry(entry) {
  if (typeof entry?.id === 'string' && VIDEO_ID.test(entry.id)) return entry.id;
  if (typeof entry?.url === 'string' && VIDEO_ID.test(entry.url)) return entry.url;
  try {
    const parsed = new URL(entry?.url || '');
    if (parsed.protocol !== 'https:' || !allowedHosts.includes(parsed.hostname)) return null;
    const id = parsed.hostname.endsWith('youtu.be')
      ? parsed.pathname.split('/').filter(Boolean)[0]
      : parsed.searchParams.get('v');
    return VIDEO_ID.test(id || '') ? id : null;
  } catch {
    return null;
  }
}

function thumbnailForEntry(entry, id) {
  const candidates = [
    entry.thumbnail,
    ...(Array.isArray(entry.thumbnails) ? entry.thumbnails : []).map((image) => image?.url)
  ];
  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      if (
        parsed.protocol === 'https:' &&
        (parsed.hostname === 'ytimg.com' || parsed.hostname.endsWith('.ytimg.com')) &&
        !parsed.username &&
        !parsed.password &&
        !parsed.port
      ) {
        return parsed.toString();
      }
    } catch {
      // A canonical public thumbnail is sufficient when extraction omits one.
    }
  }
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function libraryItems(entries, limit) {
  const seen = new Set();
  const items = [];
  for (const entry of entries) {
    const id = videoIdFromEntry(entry);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const title = String(entry.title || 'Vidéo YouTube')
      .trim()
      .slice(0, 500);
    const privateVideo = entry.availability === 'private' || entry.is_private === true;
    const unavailable =
      privateVideo ||
      ['needs_auth', 'premium_only', 'subscriber_only', 'unavailable'].includes(
        entry.availability
      ) ||
      /^\[?(?:private|deleted|unavailable) video\]?$/i.test(title) ||
      /^\[?vidéo (?:privée|supprimée|indisponible)\]?$/i.test(title);
    const duration = Number(entry.duration);
    items.push({
      id,
      title,
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnail: thumbnailForEntry(entry, id),
      duration: Number.isFinite(duration) && duration > 0 ? duration : null,
      available: !unavailable,
      ...(unavailable
        ? { reason: privateVideo ? 'Vidéo privée' : 'Vidéo indisponible ou accès requis' }
        : {})
    });
    if (items.length === limit) break;
  }
  return items;
}

class YouTubeLibraryService {
  constructor({
    ytDlpPath,
    processRunner = runProcess,
    limit = MAX_ITEMS,
    runtimePath = process.execPath
  }) {
    this.ytDlpPath = ytDlpPath;
    this.runProcess = processRunner;
    this.limit = Number.isInteger(limit) ? Math.max(1, Math.min(MAX_ITEMS, limit)) : MAX_ITEMS;
    this.runtimePath = runtimePath;
  }

  async import(source, signal) {
    if (signal?.aborted) throw createAbortError();
    const normalized = normalizeLibrarySource(source);
    let stdout;
    try {
      ({ stdout } = await this.runProcess(
        this.ytDlpPath,
        [
          '--ignore-config',
          '--flat-playlist',
          '--dump-single-json',
          '--skip-download',
          '--yes-playlist',
          '--ignore-errors',
          '--no-warnings',
          '--encoding',
          'utf-8',
          '--js-runtimes',
          `node:${this.runtimePath}`,
          '--playlist-end',
          String(this.limit + 1),
          normalized.url
        ],
        {
          signal,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
          outputLimit: 16 * 1024 * 1024
        }
      ));
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw createAbortError();
      if (/does not have a videos tab/i.test(error?.message || '')) {
        throw new Error(
          'Cette chaîne ne possède pas d’onglet Vidéos. Essayez le lien d’une playlist.',
          { cause: error }
        );
      }
      if (/private|sign in|authentication|log in/i.test(error?.message || '')) {
        throw new Error('Cette liste nécessite un accès depuis votre compte YouTube.', {
          cause: error
        });
      }
      throw new Error(
        'Impossible de récupérer cette liste YouTube. Vérifiez le lien et réessayez.',
        { cause: error }
      );
    }
    if (signal?.aborted) throw createAbortError();
    let info;
    try {
      info = JSON.parse(stdout);
    } catch {
      throw new Error('La liste YouTube n’a pas pu être lue. Réessayez.');
    }
    if (!info || !Array.isArray(info.entries)) {
      throw new Error('Cette playlist ou cette chaîne n’est pas accessible.');
    }
    const items = libraryItems(info.entries, this.limit);
    const reportedCount = Number(info.playlist_count ?? info.n_entries);
    const total = Math.max(
      Number.isSafeInteger(reportedCount) && reportedCount >= 0 ? reportedCount : 0,
      info.entries.length,
      items.length
    );
    return {
      id: String(info.id || normalized.url).slice(0, 256),
      title: String(
        info.title || (normalized.kind === 'playlist' ? 'Playlist YouTube' : 'Chaîne YouTube')
      )
        .trim()
        .slice(0, 500),
      sourceUrl: normalized.url,
      kind: normalized.kind,
      items,
      total,
      truncated: total > this.limit,
      nextPageToken: null
    };
  }
}

module.exports = { YouTubeLibraryService, normalizeLibrarySource };
