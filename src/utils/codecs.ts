export function getCodecLabel(codec?: string | null) {
  const normalizedCodec = String(codec || "").trim().toLowerCase();

  if (!normalizedCodec) {
    return null;
  }

  if (normalizedCodec.startsWith("avc1") || normalizedCodec.startsWith("h264")) {
    return "H.264";
  }

  if (
    normalizedCodec.startsWith("hvc1")
    || normalizedCodec.startsWith("hev1")
    || normalizedCodec.startsWith("hevc")
    || normalizedCodec.startsWith("h265")
  ) {
    return "HEVC";
  }

  if (normalizedCodec.startsWith("av01") || normalizedCodec.startsWith("av1")) {
    return "AV1";
  }

  if (normalizedCodec.startsWith("vp09") || normalizedCodec.startsWith("vp9")) {
    return "VP9";
  }

  if (normalizedCodec.startsWith("vp8")) {
    return "VP8";
  }

  if (normalizedCodec.startsWith("mp4a") || normalizedCodec.startsWith("aac")) {
    return "AAC";
  }

  if (normalizedCodec.startsWith("opus")) {
    return "Opus";
  }

  if (normalizedCodec.startsWith("vorbis")) {
    return "Vorbis";
  }

  return normalizedCodec.toUpperCase();
}
