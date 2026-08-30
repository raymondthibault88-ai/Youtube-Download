const test = require('node:test');
const assert = require('node:assert/strict');
const { createLineConsumer, estimateWrittenProgress, parseDownloadOutputLine, parseDownloadProgress } = require('../electron/services/download-progress.cjs');
const { buildDownloadArgs, buildFormatSelector, toFormats } = require('../electron/services/youtube.cjs');

test('format selector adds compatible audio only when necessary', () => {
  assert.equal(buildFormatSelector({ formatId: '137', hasVideo: true, hasAudio: true }), '137');
  assert.match(buildFormatSelector({ formatId: '137', hasVideo: true, hasAudio: false }), /^137\+bestaudio/);
});

test('compatible merge performs faststart inside yt-dlp', () => {
  const args = buildDownloadArgs({ ffmpegPath: '/ffmpeg', formatSelector: '137+bestaudio', outputDir: '/tmp/out', url: 'https://youtu.be/demo', shouldRecodeToMp4: false, runtimePath: '/node' });
  assert.ok(args.includes('mp4'));
  assert.ok(args.includes('Merger+ffmpeg_o:-movflags +faststart'));
});

test('download filenames stay clean and portable', () => {
  const args = buildDownloadArgs({ ffmpegPath: '/ffmpeg', formatSelector: '137', outputDir: '/tmp/out', url: 'https://youtu.be/demo', shouldRecodeToMp4: false, runtimePath: '/node' });
  const outputTemplate = args[args.indexOf('-o') + 1];
  assert.equal(outputTemplate, '%(title).180B.%(ext)s');
  assert.ok(args.includes('--windows-filenames'));
  assert.equal(outputTemplate.includes('%(id)'), false);
  assert.equal(outputTemplate.includes('['), false);
});

test('download command requests stable machine-readable progress', () => {
  const args = buildDownloadArgs({ ffmpegPath: '/ffmpeg', formatSelector: '137', outputDir: '/tmp/out', url: 'https://youtu.be/demo', shouldRecodeToMp4: false, runtimePath: '/node' });
  const template = args[args.indexOf('--progress-template') + 1];
  assert.match(template, /^download:__YTDLP_PROGRESS__:/);
  assert.ok(args.includes('stderr:never'));
});

test('format analysis preserves the numeric size for progress fallback', () => {
  const [format] = toFormats({ formats: [{ format_id: '137', resolution: '1080p', ext: 'mp4', vcodec: 'avc1', acodec: 'none', filesize: 2_000_000 }] });
  assert.equal(format.fileSizeBytes, 2_000_000);
});

test('written-byte fallback estimates progress without exceeding its reserved range', () => {
  assert.equal(estimateWrittenProgress(0, 1_000), 0);
  assert.equal(estimateWrittenProgress(500, 1_000), 48);
  assert.equal(estimateWrittenProgress(2_000, 1_000), 97);
  assert.equal(estimateWrittenProgress(500, 1_000, 82), 41);
});

test('download progress parser extracts speed and ETA', () => {
  assert.deepEqual(parseDownloadProgress('[download]  42.5% of 10MiB at 2.4MiB/s ETA 00:03'), {
    percent: 42.5,
    speed: '2.4MiB/s',
    eta: '00:03',
    raw: '[download]  42.5% of 10MiB at 2.4MiB/s ETA 00:03'
  });
});

test('download output parser ignores status lines without a percentage', () => {
  assert.equal(parseDownloadOutputLine('[download] Destination: /tmp/video.mp4'), null);
});

test('download output parser maps progress into the reserved download range', () => {
  assert.deepEqual(parseDownloadOutputLine('[download]  42.5% of 10MiB at 2.4MiB/s ETA 00:03'), {
    progress: {
      percent: 41,
      speed: '2.4MiB/s',
      eta: '00:03',
      raw: '[download]  42.5% of 10MiB at 2.4MiB/s ETA 00:03'
    }
  });
  assert.equal(parseDownloadOutputLine('[download]  50.0% of 10MiB', true).progress.percent, 41);
});

test('download output parser handles the machine-readable progress marker', () => {
  assert.deepEqual(parseDownloadOutputLine('__YTDLP_PROGRESS__: 42.5%| 2.4MiB/s| 00:03'), {
    progress: {
      percent: 41,
      speed: '2.4MiB/s',
      eta: '00:03',
      raw: 'Téléchargement… 42.5%'
    }
  });
});

test('line consumer emits progress separated by carriage returns and flushes its tail', () => {
  const lines = [];
  const consume = createLineConsumer((line) => lines.push(line));
  consume('__YTDLP_PROGRESS__: 10.0%|1MiB/s|10s\r__YTDLP_PROGRESS__: 20');
  consume('.0%|2MiB/s|8s\r');
  consume('__YTDLP_FILE__:/tmp/video.mp4');
  consume.flush();
  assert.deepEqual(lines, [
    '__YTDLP_PROGRESS__: 10.0%|1MiB/s|10s',
    '__YTDLP_PROGRESS__: 20.0%|2MiB/s|8s',
    '__YTDLP_FILE__:/tmp/video.mp4'
  ]);
});

test('download output parser extracts the final path printed on stdout', () => {
  assert.deepEqual(parseDownloadOutputLine('__YTDLP_FILE__:/tmp/video.mp4'), {
    outputPath: '/tmp/video.mp4'
  });
});
