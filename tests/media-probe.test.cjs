const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectVideoFile } = require('../electron/services/media/probe.cjs');

function inspect(stderr) {
  return inspectVideoFile('/ffmpeg', '/sample.mp4', undefined, async () => ({ stderr }));
}

test('media metadata cannot replace the real video, audio, duration or colour information', async () => {
  const signal = new AbortController().signal;
  const stderr = [
    "Input #0, mov,mp4,m4a, from 'sample.mp4':",
    '  Metadata:',
    '    title           : Video: hevc (Main 10), yuv420p10le(tv, bt2020/smpte2084, top first), 3840x2160, 900 kb/s',
    '    comment         : Audio: opus, 48000 Hz, stereo',
    '    description     : Duration: 00:00:01.00, bitrate: 700 kb/s',
    '  Duration: 00:00:10.00, start: 0.000000, bitrate: 6200 kb/s',
    '  Stream #0:0[0x1](und): Video: h264 (High), yuv420p(tv, bt709, progressive), 1920x1080, 6000 kb/s',
    '  Stream #0:1[0x2](eng): Audio: aac (LC), 48000 Hz, stereo, 160 kb/s (default)'
  ].join('\r\n');
  const result = await inspectVideoFile(
    '/ffmpeg',
    '/sample.mp4',
    signal,
    async (command, args, options) => {
      assert.equal(command, '/ffmpeg');
      assert.deepEqual(args, ['-hide_banner', '-i', '/sample.mp4']);
      assert.equal(options.signal, signal);
      assert.deepEqual(options.acceptedExitCodes, [0, 1]);
      assert.equal(options.outputLimit, 512 * 1024);
      return { stderr };
    }
  );
  assert.deepEqual(result, {
    duration: 10,
    width: 1920,
    height: 1080,
    bitrate: 6_000_000,
    codec: 'h264',
    hasAudio: true,
    audioCodec: 'aac',
    pixelFormat: 'yuv420p',
    highDynamicRange: false,
    interlaced: false,
    rotation: 0
  });
});

test('metadata and other inputs or outputs cannot invent media streams', async () => {
  const result = await inspect(
    [
      "Input #0, matroska, from 'silent.webm':",
      '  Metadata:',
      '    title           : Audio: opus',
      '  Duration: 00:00:10.00, start: 0.000000, bitrate: 4200 kb/s',
      '  Stream #0:0: Video: vp9 (Profile 0), yuv420p(tv, bt709), 1920x1080',
      "Input #1, matroska, from 'other.webm':",
      '  Duration: 00:00:20.00, start: 0.000000, bitrate: 1000 kb/s',
      '  Stream #1:0: Audio: opus, 48000 Hz, stereo',
      "Output #0, mp4, to 'other.mp4':",
      '  Stream #0:0: Audio: aac, 48000 Hz, stereo'
    ].join('\n')
  );
  assert.equal(result.hasAudio, false);
  assert.equal(result.audioCodec, null);
  assert.equal(result.codec, 'vp9');
  await assert.rejects(
    inspect(
      [
        "Input #0, matroska, from 'metadata-only.mkv':",
        '  Metadata:',
        '    title           : Video: h264, yuv420p, 1920x1080',
        '  Duration: 00:00:10.00, start: 0.000000, bitrate: 4200 kb/s'
      ].join('\n')
    ),
    { message: 'Impossible de lire les informations de cette vidéo.' }
  );
});

test('the real input duration header supplies fallback bitrate when its video has no individual bitrate', async () => {
  const result = await inspect(
    [
      "Input #1, matroska, from 'unrelated.webm':",
      '  Duration: 00:10:00.00, start: 0.000000, bitrate: 100 kb/s',
      '  Stream #1:0: Video: h264, yuv420p, 320x180',
      "Input #0, matroska,webm, from 'sample.webm':",
      '  Metadata:',
      '    comment         : Duration: 00:00:01.00, bitrate: 700 kb/s',
      '    Duration: 00:00:02.00, bitrate: 800 kb/s',
      '  Duration: 00:01:02.50, start: 0.007000, bitrate: 6200 kb/s',
      '  Stream #0:0[0x101](und): Video: av1 (Main), yuv420p(tv, bt709), 3840x2160',
      '  Stream #0:1[0x102](fra): Audio: opus, 48000 Hz, stereo',
      "Output #0, mp4, to 'out.mp4':",
      '  Duration: 00:00:03.00, bitrate: 900 kb/s',
      '  Stream #0:0: Video: h264, yuv420p, 640x360'
    ].join('\n')
  );
  assert.equal(result.duration, 62.5);
  assert.equal(result.bitrate, 6_200_000);
  assert.equal(result.codec, 'av1');
  assert.equal(result.width, 3840);
  assert.equal(result.height, 2160);
  assert.equal(result.audioCodec, 'opus');
});

test('only the first real video stream contributes its own rotation metadata and display matrix', async () => {
  for (const [selectedRotation, expected] of [
    [
      '    Metadata:\n      rotate          : 90\n      comment         : displaymatrix: rotation of 45.00 degrees\n    Side data:\n      displaymatrix: rotation of -90.00 degrees',
      -90
    ],
    [
      '    Metadata:\n      comment         : rotate: 180\n      displaymatrix: rotation of 45.00 degrees',
      0
    ],
    ['    Metadata:\n      rotate          : 90', 90],
    ['    Metadata:\n      rotate          : 0', 0]
  ]) {
    const result = await inspect(
      [
        "Input #0, mov,mp4, from 'sample.mp4':",
        '  Metadata:',
        '    rotate          : 180',
        '    comment         : displaymatrix: rotation of 180.00 degrees',
        '  Duration: 00:00:10.00, start: 0.000000, bitrate: 6200 kb/s',
        '  Stream #0:0: Video: h264, yuv420p, 1920x1080, 6000 kb/s',
        selectedRotation,
        '  Stream #0:1: Audio: aac, 48000 Hz, stereo',
        '    Metadata:',
        '      rotate          : 270',
        '    Side data:',
        '      displaymatrix: rotation of 270.00 degrees',
        '  Stream #0:2: Video: h264, yuv420p, 320x180 (default)',
        '    Side data:',
        '      displaymatrix: rotation of 45.00 degrees'
      ].join('\n')
    );
    assert.equal(result.rotation, expected);
    assert.equal(result.width, 1920);
    assert.equal(result.height, 1080);
  }
});

test('PID and language headers preserve first-track selection, HDR, interlacing and legacy headerless fixtures', async () => {
  const result = await inspect(
    [
      "Input #0, mpegts, from 'broadcast.ts':",
      '  Duration: 00:02:03.45, start: 0.000000, bitrate: 21000 kb/s',
      '  Program 1',
      '    Stream #0:0[0x100](eng): Audio: opus, 48000 Hz, stereo',
      '    Stream #0:1[0x101](und): Video: hevc (Main 10), yuv420p10le(tv, bt2020nc/bt2020/smpte2084, top coded first), 3840x2160 [SAR 4:3 DAR 64:27], 19200 kb/s',
      '      Side data:',
      '        displaymatrix: rotation of -90.00 degrees',
      '    Stream #0:2[0x102](fra): Video: h264, yuv420p, 1280x720 (default)',
      '    Stream #0:3[0x103](fra): Audio: aac, 48000 Hz, stereo (default)'
    ].join('\n')
  );
  assert.equal(result.duration, 123.45);
  assert.equal(result.bitrate, 19_200_000);
  assert.equal(result.codec, 'hevc');
  assert.equal(result.pixelFormat, 'yuv420p10le');
  assert.equal(result.highDynamicRange, true);
  assert.equal(result.interlaced, true);
  assert.equal(result.rotation, -90);
  assert.equal(result.width, 3840);
  assert.equal(result.height, 2160);
  assert.equal(result.audioCodec, 'opus');
  const legacy = await inspect(
    'Duration: 00:00:10.00, bitrate: 6000 kb/s\nStream #0:0: Video: h264, yuv420p, 1920x1080\n    displaymatrix: rotation of -90.00 degrees\n'
  );
  assert.equal(legacy.duration, 10);
  assert.equal(legacy.rotation, -90);
  assert.equal(legacy.hasAudio, false);
});
