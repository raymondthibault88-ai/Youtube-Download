const {
  analysisCacheTtlMs: ANALYSIS_TTL_MS,
  urlExpiryMarginMs: URL_EXPIRY_MARGIN_MS
} = require('../../../shared/youtube-config.json');
function canReuseAnalysis(entry, payload, now = Date.now()) {
  if (
    !entry?.info ||
    now - entry.at >= ANALYSIS_TTL_MS ||
    entry.info.is_live ||
    ['is_live', 'is_upcoming', 'post_live'].includes(entry.info.live_status)
  )
    return false;
  const formats = Array.isArray(entry.info.formats) ? entry.info.formats : [];
  const selected = formats.find(
    (format) => String(format.format_id) === String(payload.formatId).trim()
  );
  if (!selected) return false;
  const needsAudio =
    payload.mergeAudioIfNeeded || (payload.hasVideo !== false && payload.hasAudio === false);
  const relevant = [
    selected,
    ...(needsAudio
      ? formats.filter((format) => format.vcodec === 'none' && format.acodec !== 'none')
      : [])
  ];
  return relevant.every((format) =>
    [format.url, format.manifest_url, ...(format.fragments || []).map((fragment) => fragment.url)]
      .filter(Boolean)
      .every((value) => {
        try {
          const expiry = new URL(value).searchParams.get('expire');
          return !expiry || Number(expiry) * 1000 > now + URL_EXPIRY_MARGIN_MS;
        } catch {
          return false;
        }
      })
  );
}

function isStaleAnalysisError(error) {
  return /HTTP Error (?:401|403|410)|(?:URL|link|signature|token)[^\n]*expir|Requested format is not available|No video formats found/i.test(
    error?.message || ''
  );
}

function buildCachedDownloadInfo(standardInfo, fastInfo) {
  const fastFormats = new Map(
    (fastInfo.formats || []).map((format) => [String(format.format_id), format])
  );
  return {
    ...standardInfo,
    formats: standardInfo.formats.map((format) => {
      const fast = fastFormats.get(String(format.format_id));
      const sameStream =
        fast &&
        ['vcodec', 'acodec', 'height', 'fps', 'audio_channels', 'language'].every(
          (key) => (format[key] ?? null) === (fast[key] ?? null)
        );
      if (!sameStream || !fast.url) return format;
      // Keep the original client's sorting and audio inventory. Reuse only the
      // transport of the very same stream: some default-client URLs require
      // session state that cannot survive an info-json round trip.
      const copy = { ...format };
      for (const key of [
        'url',
        'protocol',
        'http_headers',
        'downloader_options',
        'manifest_url',
        'manifest_stream_number',
        'fragments',
        'fragment_base_url'
      ]) {
        if (fast[key] === undefined) delete copy[key];
        else copy[key] = fast[key];
      }
      return copy;
    })
  };
}
module.exports = {
  ANALYSIS_TTL_MS,
  canReuseAnalysis,
  isStaleAnalysisError,
  buildCachedDownloadInfo
};
