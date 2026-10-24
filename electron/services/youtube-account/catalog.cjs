const { accountError } = require('./oauth.cjs');

function text(value, fallback = '') {
  return typeof value === 'string' ? value.slice(0, 1000) : fallback;
}

function thumbnail(value) {
  const url = value?.medium?.url || value?.default?.url || value?.high?.url;
  try {
    return new URL(url).protocol === 'https:' ? url : '';
  } catch {
    return '';
  }
}

function pageToken(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 2048 || /[\r\n\0]/.test(value))
    throw accountError('La page demandée est invalide.');
  return value;
}

function playlistId(value) {
  if (typeof value !== 'string' || !/^[\w-]{2,128}$/.test(value))
    throw accountError('Cette playlist est invalide.');
  return value;
}

function duration(value) {
  const match =
    typeof value === 'string' &&
    value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!match) return null;
  return (
    Number(match[1] || 0) * 86400 +
    Number(match[2] || 0) * 3600 +
    Number(match[3] || 0) * 60 +
    Number(match[4] || 0)
  );
}

async function getChannel(request) {
  const data = await request('channels', { part: 'snippet,contentDetails', mine: 'true' });
  const item = Array.isArray(data.items) ? data.items[0] : null;
  if (!item?.id || !item.contentDetails?.relatedPlaylists?.uploads)
    throw accountError(
      'Ce compte n’a pas de chaîne YouTube accessible. Choisissez le compte associé à votre chaîne.'
    );
  return {
    id: item.id,
    title: text(item.snippet?.title, 'Ma chaîne'),
    thumbnail: thumbnail(item.snippet?.thumbnails),
    uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads
  };
}

async function getPlaylists(request, options = {}) {
  const data = await request('playlists', {
    part: 'snippet,contentDetails',
    mine: 'true',
    maxResults: '50',
    pageToken: pageToken(options.pageToken)
  });
  return {
    items: (Array.isArray(data.items) ? data.items : [])
      .filter((item) => typeof item.id === 'string' && /^[\w-]{2,128}$/.test(item.id))
      .map((item) => ({
        id: item.id,
        title: text(item.snippet?.title, 'Playlist'),
        thumbnail: thumbnail(item.snippet?.thumbnails),
        videoCount: Math.max(0, Number(item.contentDetails?.itemCount) || 0)
      })),
    nextPageToken: pageToken(data.nextPageToken) || null
  };
}

async function getVideos(request, options = {}) {
  const data = await request('playlistItems', {
    part: 'snippet,contentDetails',
    playlistId: playlistId(options.playlistId),
    maxResults: '50',
    pageToken: pageToken(options.pageToken)
  });
  const entries = (Array.isArray(data.items) ? data.items : [])
    .map((item) => ({
      item,
      id: item.contentDetails?.videoId || item.snippet?.resourceId?.videoId
    }))
    .filter((entry) => typeof entry.id === 'string' && /^[\w-]{11}$/.test(entry.id));
  const ids = [...new Set(entries.map((entry) => entry.id))];
  const details = ids.length
    ? await request('videos', { part: 'snippet,contentDetails,status', id: ids.join(',') })
    : { items: [] };
  const byId = new Map(
    (Array.isArray(details.items) ? details.items : []).map((item) => [item.id, item])
  );
  return {
    items: entries.map(({ item, id }) => {
      const detail = byId.get(id);
      return {
        id,
        title: text(detail?.snippet?.title || item.snippet?.title, 'Vidéo YouTube'),
        url: `https://www.youtube.com/watch?v=${id}`,
        thumbnail: thumbnail(detail?.snippet?.thumbnails || item.snippet?.thumbnails),
        duration: duration(detail?.contentDetails?.duration),
        available: Boolean(detail),
        ...(detail?.status?.privacyStatus ? { privacyStatus: detail.status.privacyStatus } : {}),
        ...(!detail ? { reason: 'Vidéo supprimée ou inaccessible.' } : {})
      };
    }),
    nextPageToken: pageToken(data.nextPageToken) || null
  };
}

module.exports = { getChannel, getPlaylists, getVideos };
