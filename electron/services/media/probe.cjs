const { runProcess } = require('../process-runner.cjs');
const STREAM_HEADER = /^[ \t]*Stream #(\d+):\d+(?:\[[^\]]*\]|\([^)]*\))*:\s*(\w+):\s*(.*)$/;

function parseFfmpegTime(value) {
  const match = String(value || '').match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function inputSection(stderr) {
  const lines = stderr.split(/\r?\n/);
  const start = lines.findIndex((line) => /^Input #0,/.test(line));
  const withHeader = start >= 0;
  // Existing test runners can omit the outer Input header. Once an Input
  // header is present, never borrow metadata from another input or an output.
  if (!withHeader && lines.some((line) => /^Input #\d+,/.test(line)))
    return { lines: [], withHeader };
  const section = lines.slice(withHeader ? start + 1 : 0);
  const end = section.findIndex((line) => /^(?:Input|Output) #\d+,/.test(line));
  return { lines: end < 0 ? section : section.slice(0, end), withHeader };
}

function videoRotation(lines, withHeader) {
  let section = null;
  let metadataRotation;
  let matrixRotation;
  for (const line of lines) {
    if (/^[ \t]*Metadata:\s*$/.test(line)) section = 'metadata';
    else if (/^[ \t]*Side data:\s*$/.test(line)) section = 'side-data';
    else if (section === 'metadata') {
      const rotate = line.match(/^[ \t]*rotate\s*:\s*([+-]?\d+(?:\.\d+)?)\s*$/);
      if (rotate && metadataRotation === undefined) metadataRotation = Number(rotate[1]);
    } else if (section === 'side-data' || (!withHeader && section === null)) {
      const matrix = line.match(
        /^[ \t]*displaymatrix:\s*rotation of\s*([+-]?\d+(?:\.\d+)?)\s+degrees\s*$/
      );
      if (matrix && matrixRotation === undefined) matrixRotation = Number(matrix[1]);
    }
  }
  return matrixRotation ?? metadataRotation ?? 0;
}

async function inspectVideoFile(ffmpegPath, inputPath, signal, processRunner = runProcess) {
  const { stderr } = await processRunner(ffmpegPath, ['-hide_banner', '-i', inputPath], {
    signal,
    acceptedExitCodes: [0, 1],
    outputLimit: 512 * 1024
  });
  const { lines, withHeader } = inputSection(stderr);
  const durationHeader = withHeader
    ? /^ {2}Duration:\s*(?:\d+:\d+:\d+(?:\.\d+)?|N\/A)(?:,|$)/
    : /^[ \t]*Duration:\s*(?:\d+:\d+:\d+(?:\.\d+)?|N\/A)(?:,|$)/;
  const durationLine = lines.find((line) => durationHeader.test(line)) || '';
  const duration =
    parseFfmpegTime(durationLine.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/)?.[1]) || 0;
  const streams = lines
    .map((line, index) => ({ match: line.match(STREAM_HEADER), index }))
    .filter(({ match }) => match?.[1] === '0');
  const video = streams.find(({ match }) => match[2] === 'Video');
  const audio = streams.find(({ match }) => match[2] === 'Audio');
  const videoLine = video?.match[3] || '';
  const audioLine = audio?.match[3] || '';
  const dimensions = videoLine.match(/(?:^|\s)(\d{2,5})x(\d{2,5})(?:[\s,]|$)/);
  const videoBitrate = Number(videoLine.match(/(\d+)\s*kb\/s/)?.[1] || 0) * 1000;
  const totalBitrate = Number(durationLine.match(/\bbitrate:\s*(\d+)\s*kb\/s/)?.[1] || 0) * 1000;
  const followingStream = video
    ? lines.findIndex((line, index) => index > video.index && STREAM_HEADER.test(line))
    : -1;
  const rotation = video
    ? videoRotation(
        lines.slice(video.index + 1, followingStream < 0 ? lines.length : followingStream),
        withHeader
      )
    : 0;
  if (!duration || !dimensions)
    throw new Error('Impossible de lire les informations de cette vidéo.');
  return {
    duration,
    width: Number(dimensions[1]),
    height: Number(dimensions[2]),
    bitrate: videoBitrate || totalBitrate,
    codec: videoLine.match(/^(\w+)/)?.[1] || null,
    hasAudio: Boolean(audio),
    audioCodec: audioLine.match(/^(\w+)/)?.[1] || null,
    pixelFormat: videoLine.match(/,\s*(yuv\w+|nv12|p010le)\b/)?.[1] || null,
    highDynamicRange: /bt2020|smpte2084|arib-std-b67/i.test(videoLine),
    interlaced: /interlaced|top first|bottom first|top coded first|bottom coded first/i.test(
      videoLine
    ),
    rotation
  };
}
module.exports = { parseFfmpegTime, inspectVideoFile };
