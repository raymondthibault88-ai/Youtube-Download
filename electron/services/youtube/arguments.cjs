const downloadConfig = require('../../../shared/download-config.json');
const { PROGRESS_TEMPLATE } = require('./progress.cjs');
const FAST_EXTRACTOR_ARGS = 'youtube:player_client=web_embedded,web_safari';
function buildAnalyzeArgs(url, fast = true, runtimePath = process.execPath) {
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--encoding',
    'utf-8',
    '--js-runtimes',
    `node:${runtimePath}`,
    '--skip-download'
  ];
  if (fast) args.push('--extractor-args', FAST_EXTRACTOR_ARGS);
  args.push('-J', url);
  return args;
}

function buildDownloadArgs({
  ffmpegPath,
  formatSelector,
  outputDir,
  url,
  shouldRecodeToMp4,
  infoPath,
  fastExtraction = false,
  concurrentFragments = downloadConfig.concurrentFragments,
  runtimePath = process.execPath
}) {
  const args = [
    '--newline',
    '--no-playlist',
    '--no-warnings',
    '--encoding',
    'utf-8',
    '--js-runtimes',
    `node:${runtimePath}`,
    '--progress',
    '--progress-template',
    PROGRESS_TEMPLATE,
    '--ffmpeg-location',
    ffmpegPath,
    '--format-sort',
    'vcodec:h264,acodec:aac',
    '-f',
    formatSelector
  ];
  if (concurrentFragments > 1) args.push('-N', String(Math.floor(concurrentFragments)));
  if (fastExtraction) args.push('--extractor-args', FAST_EXTRACTOR_ARGS);
  if (formatSelector.includes('+')) {
    args.push('--merge-output-format', shouldRecodeToMp4 ? 'mkv' : 'mp4');
    if (!shouldRecodeToMp4)
      args.push('--postprocessor-args', 'Merger+ffmpeg_o:-movflags +faststart');
  }
  args.push(
    '--print',
    'after_move:__YTDLP_FILE__:%(filepath)s',
    '-o',
    downloadConfig.outputTemplate,
    '-P',
    outputDir
  );
  // Passing the URL as well would ask yt-dlp to download the video twice.
  if (infoPath) args.push('--load-info-json', infoPath);
  else args.push(url);
  return args;
}
module.exports = { buildAnalyzeArgs, buildDownloadArgs };
