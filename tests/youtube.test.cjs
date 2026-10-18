const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAnalyzeArgs,
  buildDownloadArgs,
  buildFormatSelector,
  parseDownloadProgress,
  createDownloadProgressTracker
} = require('../electron/services/youtube.cjs');

test('yt-dlp emits UTF-8 so Windows accented output paths survive decoding', () => {
  const analyze = buildAnalyzeArgs('https://youtu.be/demo');
  const download = buildDownloadArgs({
    ffmpegPath: '/ffmpeg',
    formatSelector: '22',
    outputDir: '/tmp/out',
    url: 'https://youtu.be/demo'
  });
  for (const args of [analyze, download])
    assert.equal(args[args.indexOf('--encoding') + 1], 'utf-8');
});

test('format selector adds compatible audio only when necessary', () => {
  assert.equal(buildFormatSelector({ formatId: '137', hasVideo: true, hasAudio: true }), '137');
  assert.match(
    buildFormatSelector({ formatId: '137', hasVideo: true, hasAudio: false }),
    /^137\+bestaudio/
  );
});

test('overall download progress remains monotonic between video and audio streams', () => {
  const track = createDownloadProgressTracker({ separateAudio: true });
  const line = (id, percent) =>
    '__YTDLP_PROGRESS__:' +
    JSON.stringify({ id, percent: `${percent}%`, speed: '2.4MiB/s', eta: '00:03' });
  const first = track(line('137', 100));
  const second = track(line('140', 2));
  const complete = track(line('140', 100));
  assert.equal(first.stage, 'video');
  assert.equal(second.stage, 'audio');
  assert.ok(second.percent >= first.percent);
  assert.equal(complete.percent, 97);
  assert.equal(track('[download] Destination: test.mp4'), null);
  assert.equal(track('__YTDLP_PROGRESS__:invalid'), null);
  assert.equal(track(line('140', 'unknown')), null);
});

test('recoding reserves its own progress range and never reports premature completion', () => {
  const track = createDownloadProgressTracker({ recode: true });
  const done = track(
    '__YTDLP_PROGRESS__:' + JSON.stringify({ id: '401', percent: '100%', speed: 'NA', eta: 'NA' })
  );
  assert.equal(done.percent, 82);
  assert.equal(done.speed, null);
  assert.equal(done.eta, null);
});

test('compatible merge performs faststart inside yt-dlp', () => {
  const args = buildDownloadArgs({
    ffmpegPath: '/ffmpeg',
    formatSelector: '137+bestaudio',
    outputDir: '/tmp/out',
    url: 'https://youtu.be/demo',
    shouldRecodeToMp4: false,
    runtimePath: '/node'
  });
  assert.ok(args.includes('mp4'));
  assert.ok(args.includes('Merger+ffmpeg_o:-movflags +faststart'));
});

test('download progress parser extracts speed and ETA', () => {
  assert.deepEqual(parseDownloadProgress('[download]  42.5% of 10MiB at 2.4MiB/s ETA 00:03'), {
    percent: 42.5,
    speed: '2.4MiB/s',
    eta: '00:03',
    raw: '[download]  42.5% of 10MiB at 2.4MiB/s ETA 00:03'
  });
});
