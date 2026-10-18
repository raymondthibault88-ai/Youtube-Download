const { formatBytes } = require('../../../shared/formatters.js');
const VIDEO_CODECS = ['avc1', 'h264'];
const AUDIO_CODECS = ['mp4a', 'aac'];
function normalizeCodec(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function hasPrefix(codec, prefixes) {
  const normalized = normalizeCodec(codec);
  return Boolean(normalized && prefixes.some((prefix) => normalized.startsWith(prefix)));
}

function toFormats(info) {
  const formats = Array.isArray(info.formats) ? info.formats : [];
  const hasCompatibleAudio = formats.some(
    (format) =>
      format.vcodec === 'none' && format.acodec !== 'none' && hasPrefix(format.acodec, AUDIO_CODECS)
  );
  return formats
    .map((format) => {
      const hasVideo = Boolean(format.vcodec && format.vcodec !== 'none');
      const hasAudio = Boolean(format.acodec && format.acodec !== 'none');
      const videoCodec = hasVideo ? normalizeCodec(format.vcodec) : null;
      const audioCodec = hasAudio ? normalizeCodec(format.acodec) : null;
      return {
        id: String(format.format_id),
        resolution: format.resolution || (format.height ? `${format.height}p` : 'audio only'),
        height: Number(format.height || 0),
        ext: format.ext,
        fps: format.fps || null,
        hasVideo,
        hasAudio,
        videoCodec,
        audioCodec,
        quickTimeCompatible:
          hasVideo &&
          hasPrefix(videoCodec, VIDEO_CODECS) &&
          (hasAudio ? hasPrefix(audioCodec, AUDIO_CODECS) : hasCompatibleAudio),
        fileSizeText: formatBytes(format.filesize || format.filesize_approx)
      };
    })
    .filter((format) => format.hasVideo)
    .sort((a, b) => b.height - a.height || (b.fps || 0) - (a.fps || 0))
    .map((format) => {
      const output = { ...format };
      delete output.height;
      return output;
    });
}

function buildFormatSelector(payload) {
  const requested = String(payload.formatId).trim();
  const needsAudio =
    payload.mergeAudioIfNeeded || (payload.hasVideo !== false && payload.hasAudio === false);
  return needsAudio
    ? `${requested}+bestaudio[ext=m4a]/${requested}+bestaudio/${requested}`
    : requested;
}

function canRemuxCompatibleMp4(mediaInfo) {
  return (
    mediaInfo.codec === 'h264' &&
    mediaInfo.pixelFormat === 'yuv420p' &&
    !mediaInfo.highDynamicRange &&
    !mediaInfo.interlaced &&
    !mediaInfo.rotation &&
    (mediaInfo.hasAudio === false || mediaInfo.audioCodec === 'aac')
  );
}
module.exports = { toFormats, buildFormatSelector, canRemuxCompatibleMp4 };
