const { runProcess } = require('../process-runner.cjs');
function parseFfmpegTime(value) {
  const match = String(value || '').match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function inspectVideoFile(ffmpegPath, inputPath, signal, processRunner = runProcess) {
  const { stderr } = await processRunner(ffmpegPath, ['-hide_banner', '-i', inputPath], {
    signal,
    acceptedExitCodes: [0, 1],
    outputLimit: 512 * 1024
  });
  const duration = parseFfmpegTime(stderr.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/)?.[1]) || 0;
  const videoLine = stderr.split('\n').find((line) => /Video:/.test(line)) || '';
  const audioLine = stderr.split('\n').find((line) => /Audio:/.test(line)) || '';
  const dimensions = videoLine.match(/(?:^|\s)(\d{2,5})x(\d{2,5})(?:[\s,]|$)/);
  const videoBitrate = Number(videoLine.match(/(\d+)\s*kb\/s/)?.[1] || 0) * 1000;
  const totalBitrate =
    Number(stderr.match(/Duration:[^\n]*bitrate:\s*(\d+)\s*kb\/s/)?.[1] || 0) * 1000;
  const rotation = Number(
    stderr.match(/displaymatrix:\s*rotation of\s*(-?[\d.]+)/)?.[1] ||
      stderr.match(/\brotate\s*:\s*(-?[\d.]+)/)?.[1] ||
      0
  );
  if (!duration || !dimensions)
    throw new Error('Impossible de lire les informations de cette vidéo.');
  return {
    duration,
    width: Number(dimensions[1]),
    height: Number(dimensions[2]),
    bitrate: videoBitrate || totalBitrate,
    codec: videoLine.match(/Video:\s*(\w+)/)?.[1] || null,
    hasAudio: Boolean(audioLine),
    audioCodec: audioLine.match(/Audio:\s*(\w+)/)?.[1] || null,
    pixelFormat: videoLine.match(/,\s*(yuv\w+|nv12|p010le)\b/)?.[1] || null,
    highDynamicRange: /bt2020|smpte2084|arib-std-b67/i.test(videoLine),
    interlaced: /interlaced|top first|bottom first|top coded first|bottom coded first/i.test(
      videoLine
    ),
    rotation
  };
}
module.exports = { parseFfmpegTime, inspectVideoFile };
