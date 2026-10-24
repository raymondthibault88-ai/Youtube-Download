const HARDWARE_ENCODERS = {
  darwin: ['h264_videotoolbox'],
  win32: ['h264_nvenc', 'h264_qsv', 'h264_amf'],
  linux: ['h264_nvenc', 'h264_qsv']
};
// Retain the validated H.264/HEVC reader selection; select the AV1 QSV reader
// explicitly only for the 4K path validated against CPU decoding.
const QSV_INPUT_DECODERS = new Map([
  ['h264', null],
  ['hevc', null],
  ['av1', 'av1_qsv']
]);
function conversionPipeline(encoder, mediaInfo, targetHeight, forceSoftwareDecode) {
  const resize = targetHeight && mediaInfo.height > targetHeight;
  const scale = resize ? [`scale=-2:${targetHeight}`] : [];
  const decoder = QSV_INPUT_DECODERS.get(mediaInfo.codec);
  // Restrict the new decoder path to SDR 8-bit 4:2:0 streams. Keep FFmpeg's
  // existing handling of HDR, chroma conversion, interlacing and autorotation.
  const accelerated =
    encoder === 'h264_qsv' &&
    !forceSoftwareDecode &&
    QSV_INPUT_DECODERS.has(mediaInfo.codec) &&
    (!decoder || mediaInfo.height >= 2160) &&
    mediaInfo.pixelFormat === 'yuv420p' &&
    !mediaInfo.highDynamicRange &&
    !mediaInfo.interlaced &&
    !mediaInfo.rotation &&
    !resize;
  if (!accelerated)
    return { input: [], filters: scale, pixelFormat: 'yuv420p', accelerated: false };
  return {
    input: [
      '-hwaccel',
      'qsv',
      '-hwaccel_output_format',
      'qsv',
      '-extra_hw_frames',
      '32',
      ...(decoder ? ['-c:v', decoder] : [])
    ],
    // Native-size transcoding avoids GPU readback. Resizing keeps the original
    // decoder/scaler: GPU scaling changes the image; readback was slower.
    filters: [],
    pixelFormat: 'qsv',
    accelerated: true
  };
}
module.exports = { HARDWARE_ENCODERS, conversionPipeline };
