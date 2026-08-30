const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDownloadArgs, buildFormatSelector, parseDownloadProgress } = require('../electron/services/youtube.cjs');

test('format selector adds compatible audio only when necessary', () => {
  assert.equal(buildFormatSelector({ formatId: '137', hasVideo: true, hasAudio: true }), '137');
  assert.match(buildFormatSelector({ formatId: '137', hasVideo: true, hasAudio: false }), /^137\+bestaudio/);
});

test('compatible merge performs faststart inside yt-dlp', () => {
  const args = buildDownloadArgs({ ffmpegPath: '/ffmpeg', formatSelector: '137+bestaudio', outputDir: '/tmp/out', url: 'https://youtu.be/demo', shouldRecodeToMp4: false, runtimePath: '/node' });
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
