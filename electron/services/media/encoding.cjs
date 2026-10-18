const HARDWARE_ENCODERS = {
  darwin: ['h264_videotoolbox'],
  win32: ['h264_nvenc', 'h264_qsv', 'h264_amf'],
  linux: ['h264_nvenc', 'h264_qsv']
};
function conversionPipeline(encoder, mediaInfo, targetHeight, forceSoftwareDecode) {
  const resize = targetHeight && mediaInfo.height > targetHeight;
  const scale = resize ? [`scale=-2:${targetHeight}`] : [];
  // Restrict the new decoder path to SDR 8-bit 4:2:0 streams. Keep FFmpeg's
  // existing handling of HDR, chroma conversion, interlacing and autorotation.
  const accelerated =
    encoder === 'h264_qsv' &&
    !forceSoftwareDecode &&
    ['h264', 'hevc'].includes(mediaInfo.codec) &&
    mediaInfo.pixelFormat === 'yuv420p' &&
    !mediaInfo.highDynamicRange &&
    !mediaInfo.interlaced &&
    !mediaInfo.rotation &&
    !resize;
  if (!accelerated)
    return { input: [], filters: scale, pixelFormat: 'yuv420p', accelerated: false };
  return {
    input: ['-hwaccel', 'qsv', '-hwaccel_output_format', 'qsv', '-extra_hw_frames', '32'],
    // Native-size transcoding avoids GPU readback. Resizing keeps the original
    // decoder/scaler: GPU scaling changes the image; readback was slower.
    filters: [],
    pixelFormat: 'qsv',
    accelerated: true
  };
}
module.exports = { HARDWARE_ENCODERS, conversionPipeline };
