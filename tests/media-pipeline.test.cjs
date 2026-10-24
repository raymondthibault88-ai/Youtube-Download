const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MediaService, getTargetVideoBitrate } = require('../electron/services/media.cjs');

const mediaInfo = {
  codec: 'h264',
  pixelFormat: 'yuv420p',
  width: 3840,
  height: 2160,
  duration: 10,
  bitrate: 20_000_000,
  rotation: 0,
  interlaced: false,
  highDynamicRange: false
};

function setup(t, runner) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'video-v5-pipeline-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, 'Vidéo originale é.mp4');
  fs.writeFileSync(inputPath, 'original');
  const service = new MediaService('/ffmpeg', { processRunner: runner });
  service.detectHardwareEncoder = async () => 'h264_qsv';
  return {
    directory,
    inputPath,
    service,
    request: { inputPath, outputDir: directory, mediaInfo, profileId: 'fast' }
  };
}

function complete(args) {
  fs.writeFileSync(args.at(-1), 'converted');
  return { stdout: '', stderr: '' };
}

test('inspection records the codec, bit depth, HDR, interlacing and rotation before choosing a decoder', async () => {
  let stderr =
    'Duration: 00:00:10.00, start: 0, bitrate: 20000 kb/s\n' +
    '  Stream #0:0: Video: hevc (Main 10), yuv420p10le(tv, bt2020nc/bt2020/smpte2084, top first), 3840x2160, 19000 kb/s\n' +
    '    displaymatrix: rotation of -90.00 degrees\n';
  const service = new MediaService('/ffmpeg', { processRunner: async () => ({ stderr }) });
  const hdr = await service.inspect('/sample.mov');
  assert.equal(hdr.codec, 'hevc');
  assert.equal(hdr.pixelFormat, 'yuv420p10le');
  assert.equal(hdr.highDynamicRange, true);
  assert.equal(hdr.interlaced, true);
  assert.equal(hdr.rotation, -90);
  assert.equal(hdr.hasAudio, false);
  assert.equal(hdr.audioCodec, null);
  stderr =
    'Duration: 00:00:10.00, bitrate: 6000 kb/s\nStream #0:0: Video: h264 (High), yuv420p(progressive), 1920x1080, 5800 kb/s\nStream #0:1: Audio: aac (LC), 48000 Hz, stereo\nStream #0:2: Audio: opus, 48000 Hz, stereo\n';
  const sdr = await service.inspect('/sample.mp4');
  assert.equal(sdr.codec, 'h264');
  assert.equal(sdr.pixelFormat, 'yuv420p');
  assert.equal(sdr.highDynamicRange, false);
  assert.equal(sdr.interlaced, false);
  assert.equal(sdr.rotation, 0);
  assert.equal(sdr.hasAudio, true);
  assert.equal(sdr.audioCodec, 'aac');
});

test('Quick Sync keeps native frames in GPU memory without changing compression, audio or filenames', async (t) => {
  let command;
  const { inputPath, service, request } = setup(t, async (_ffmpeg, args) => {
    command = args;
    return complete(args);
  });
  const output = await service.convert(request);
  assert.ok(command.indexOf('-hwaccel') < command.indexOf('-i'));
  assert.equal(command[command.indexOf('-hwaccel_output_format') + 1], 'qsv');
  assert.equal(command[command.indexOf('-pix_fmt') + 1], 'qsv');
  assert.equal(command[command.indexOf('-c:v') + 1], 'h264_qsv');
  assert.equal(command[command.indexOf('-preset') + 1], 'veryfast');
  assert.equal(
    command[command.indexOf('-b:v') + 1],
    String(getTargetVideoBitrate(2160, mediaInfo.bitrate, 'fast'))
  );
  assert.equal(command[command.indexOf('-c:a') + 1], 'aac');
  assert.equal(command[command.indexOf('-b:a') + 1], '160000');
  assert.equal(command[command.indexOf('-tag:v') + 1], 'avc1');
  assert.ok(command.includes('+faststart'));
  assert.ok(!command.includes('-vf'));
  assert.equal(path.basename(output), 'Vidéo originale é (2).mp4');
  assert.equal(fs.readFileSync(inputPath, 'utf8'), 'original');
  for (const codec of ['h264', 'hevc']) {
    await service.convert({
      ...request,
      targetHeight: 1080,
      mediaInfo: { ...mediaInfo, codec, width: 1920, height: 1080 }
    });
    assert.ok(command.includes('-hwaccel'));
    assert.equal(command[command.indexOf('-pix_fmt') + 1], 'qsv');
    assert.equal(command[command.indexOf('-c:v') + 1], 'h264_qsv');
    assert.equal(command.filter((value) => value === '-c:v').length, 1);
    assert.ok(!command.includes('-vf'));
  }
});

for (const codec of ['av1']) {
  test(`${codec} 4K uses an input QSV decoder and preserves the output encoder, profiles and native resolution`, async (t) => {
    let command;
    const { service, request } = setup(t, async (_ffmpeg, args) => {
      command = args;
      return complete(args);
    });
    for (const targetHeight of [null, 2160]) {
      for (const profileId of ['fast', 'balanced']) {
        await service.convert({
          ...request,
          targetHeight,
          profileId,
          mediaInfo: { ...mediaInfo, codec }
        });
        const inputIndex = command.indexOf('-i');
        const decoderIndex = command.indexOf('-c:v');
        const encoderIndex = command.lastIndexOf('-c:v');
        assert.ok(decoderIndex < inputIndex && encoderIndex > inputIndex);
        assert.equal(command[decoderIndex + 1], `${codec}_qsv`);
        assert.equal(command[encoderIndex + 1], 'h264_qsv');
        assert.equal(command.filter((value) => value === '-c:v').length, 2);
        assert.equal(command[command.indexOf('-hwaccel') + 1], 'qsv');
        assert.equal(command[command.indexOf('-hwaccel_output_format') + 1], 'qsv');
        assert.equal(command[command.indexOf('-pix_fmt') + 1], 'qsv');
        assert.equal(command[command.indexOf('-preset') + 1], 'veryfast');
        assert.equal(
          command[command.indexOf('-b:v') + 1],
          String(getTargetVideoBitrate(2160, mediaInfo.bitrate, profileId))
        );
        assert.equal(command[command.indexOf('-c:a') + 1], 'aac');
        assert.equal(command[command.indexOf('-b:a') + 1], '160000');
        assert.equal(command[command.indexOf('-tag:v') + 1], 'avc1');
        assert.ok(command.includes('+faststart'));
        assert.ok(!command.includes('-vf'));
      }
    }
  });

  test(`${codec} keeps the existing CPU reader for unsupported colour, transforms, profiles and encoders`, async (t) => {
    let expectedEncoder = 'h264_qsv';
    let expectedScale = null;
    const { service, request } = setup(t, async (_ffmpeg, args) => {
      assert.ok(!args.includes('-hwaccel'));
      assert.ok(!args.includes(`${codec}_qsv`));
      assert.equal(args.filter((value) => value === '-c:v').length, 1);
      assert.equal(args[args.indexOf('-c:v') + 1], expectedEncoder);
      assert.equal(args[args.indexOf('-pix_fmt') + 1], 'yuv420p');
      if (expectedScale) assert.equal(args[args.indexOf('-vf') + 1], expectedScale);
      else assert.ok(!args.includes('-vf'));
      return complete(args);
    });
    for (const testCase of [
      { media: { width: 1920, height: 1080 } },
      { media: { width: 2560, height: 1440 } },
      { media: { pixelFormat: 'yuv420p10le' } },
      { media: { pixelFormat: 'yuvj420p' } },
      { media: { pixelFormat: 'yuv422p' } },
      { media: { highDynamicRange: true } },
      { media: { rotation: -90 } },
      { media: { interlaced: true } },
      { request: { targetHeight: 1080 }, scale: 'scale=-2:1080' },
      { request: { forceSoftwareDecode: true } },
      { request: { profileId: 'compact' }, encoder: 'libx264' },
      { encoder: 'h264_nvenc' },
      { encoder: 'h264_amf' },
      { encoder: 'h264_videotoolbox' }
    ]) {
      expectedEncoder = testCase.encoder || 'h264_qsv';
      expectedScale = testCase.scale || null;
      service.detectHardwareEncoder = async () => expectedEncoder;
      await service.convert({
        ...request,
        ...testCase.request,
        mediaInfo: { ...mediaInfo, codec, ...testCase.media }
      });
    }
  });

  test(`${codec} decoder failure clears input decoder arguments before the existing hardware and software retries`, async (t) => {
    const attempts = [];
    const progress = [];
    const { inputPath, directory, service, request } = setup(t, async (_ffmpeg, args, options) => {
      attempts.push(args);
      options.onStdout(
        Buffer.from(
          `out_time=00:00:0${attempts.length === 1 ? 7 : 3}.00\nspeed=2.0x\nprogress=continue\n`
        )
      );
      fs.writeFileSync(args.at(-1), 'partial');
      if (attempts.length < 3) throw new Error('Unsupported decoder or unavailable device');
      return complete(args);
    });
    const output = await service.convert({
      ...request,
      mediaInfo: { ...mediaInfo, codec },
      profileId: 'balanced',
      onProgress: ({ percent }) => progress.push(percent)
    });
    assert.equal(attempts[0][attempts[0].indexOf('-c:v') + 1], `${codec}_qsv`);
    assert.deepEqual(
      attempts.map((args) => args[args.lastIndexOf('-c:v') + 1]),
      ['h264_qsv', 'h264_qsv', 'libx264']
    );
    assert.deepEqual(
      attempts.map((args) => args.includes('-hwaccel')),
      [true, false, false]
    );
    for (const args of attempts.slice(1)) {
      assert.ok(!args.includes(`${codec}_qsv`));
      assert.equal(args.filter((value) => value === '-c:v').length, 1);
    }
    assert.equal(attempts[2][attempts[2].indexOf('-preset') + 1], 'faster');
    assert.ok(progress.every((value, index) => !index || value >= progress[index - 1]));
    assert.equal(fs.readFileSync(inputPath, 'utf8'), 'original');
    assert.equal(fs.readFileSync(output, 'utf8'), 'converted');
    assert.ok(!fs.readdirSync(directory).some((name) => name.includes('.tmp.')));
  });

  test(`${codec} hardware decoding cancellation cleans its partial output and never retries`, async (t) => {
    const controller = new AbortController();
    let attempts = 0;
    const { directory, service, request } = setup(t, async (_ffmpeg, args) => {
      attempts++;
      assert.ok(args.includes(`${codec}_qsv`));
      fs.writeFileSync(args.at(-1), 'partial');
      controller.abort();
      const error = new Error('Cancelled');
      error.name = 'AbortError';
      throw error;
    });
    await assert.rejects(
      service.convert({
        ...request,
        mediaInfo: { ...mediaInfo, codec },
        signal: controller.signal
      }),
      { name: 'AbortError' }
    );
    assert.equal(attempts, 1);
    assert.deepEqual(fs.readdirSync(directory), ['Vidéo originale é.mp4']);
  });
}

test('VP9 keeps the original CPU reader at native resolutions including 4K', async (t) => {
  let command;
  const { service, request } = setup(t, async (_ffmpeg, args) => {
    command = args;
    return complete(args);
  });
  for (const height of [1080, 2160, 4320]) {
    for (const profileId of ['fast', 'balanced', 'compact']) {
      await service.convert({
        ...request,
        profileId,
        mediaInfo: { ...mediaInfo, codec: 'vp9', width: (height * 16) / 9, height }
      });
      assert.ok(!command.includes('-hwaccel'));
      assert.ok(!command.includes('vp9_qsv'));
      assert.equal(command.filter((value) => value === '-c:v').length, 1);
      assert.equal(
        command[command.indexOf('-c:v') + 1],
        profileId === 'compact' ? 'libx264' : 'h264_qsv'
      );
      assert.equal(command[command.indexOf('-pix_fmt') + 1], 'yuv420p');
      assert.equal(
        command[command.indexOf('-b:v') + 1],
        String(getTargetVideoBitrate(height, mediaInfo.bitrate, profileId))
      );
      assert.ok(!command.includes('-vf'));
    }
  }
});

test('resizing preserves the original CPU decoder and resampling algorithm', async (t) => {
  const { service, request } = setup(t, async (_ffmpeg, args) => {
    assert.ok(!args.includes('-hwaccel'));
    assert.equal(args[args.indexOf('-vf') + 1], 'scale=-2:1080');
    assert.equal(args[args.indexOf('-pix_fmt') + 1], 'yuv420p');
    assert.equal(
      args[args.indexOf('-b:v') + 1],
      String(getTargetVideoBitrate(1080, mediaInfo.bitrate, 'balanced'))
    );
    return complete(args);
  });
  await service.convert({ ...request, targetHeight: 1080, profileId: 'balanced' });
});

test('unsupported pixel formats, codecs, HDR, rotation and interlacing retain the original path', async (t) => {
  const { service, request } = setup(t, async (_ffmpeg, args) => {
    assert.ok(!args.includes('-hwaccel'));
    assert.equal(args[args.indexOf('-vf') + 1], 'scale=-2:1080');
    assert.equal(args[args.indexOf('-pix_fmt') + 1], 'yuv420p');
    return complete(args);
  });
  for (const change of [
    { codec: 'vp9' },
    { pixelFormat: 'yuv420p10le' },
    { pixelFormat: 'yuvj420p' },
    { highDynamicRange: true },
    { rotation: 90 },
    { interlaced: true },
    { codec: null }
  ]) {
    await service.convert({
      ...request,
      targetHeight: 1080,
      mediaInfo: { ...mediaInfo, ...change }
    });
  }
});

test('the compact profile keeps its software encoder and compression preset', async (t) => {
  const { service, request } = setup(t, async (_ffmpeg, args) => {
    assert.ok(!args.includes('-hwaccel'));
    assert.equal(args[args.indexOf('-c:v') + 1], 'libx264');
    assert.equal(args[args.indexOf('-preset') + 1], 'fast');
    return complete(args);
  });
  service.detectHardwareEncoder = () => assert.fail('Compact must not probe the GPU.');
  await service.convert({ ...request, profileId: 'compact' });
});

test('other hardware encoders keep their existing decoder, scaler and pixel format', async (t) => {
  let selected;
  const { service, request } = setup(t, async (_ffmpeg, args) => {
    assert.ok(!args.includes('-hwaccel'));
    assert.equal(args[args.indexOf('-c:v') + 1], selected);
    assert.equal(args[args.indexOf('-vf') + 1], 'scale=-2:1080');
    assert.equal(args[args.indexOf('-pix_fmt') + 1], 'yuv420p');
    return complete(args);
  });
  for (const encoder of ['h264_nvenc', 'h264_amf', 'h264_videotoolbox']) {
    selected = encoder;
    service.detectHardwareEncoder = async () => encoder;
    await service.convert({ ...request, targetHeight: 1080 });
  }
});

test('a failed accelerated decoder retries the same hardware encoder before falling back to software', async (t) => {
  const attempts = [];
  const progress = [];
  const { inputPath, directory, service, request } = setup(t, async (_ffmpeg, args, options) => {
    attempts.push(args);
    options.onStdout(
      Buffer.from(
        `out_time=00:00:0${attempts.length === 1 ? 7 : 3}.00\nspeed=2.0x\nprogress=continue\n`
      )
    );
    fs.writeFileSync(args.at(-1), 'partial');
    if (attempts.length < 3) throw new Error('Device failed');
    return complete(args);
  });
  const output = await service.convert({
    ...request,
    profileId: 'balanced',
    onProgress: ({ percent }) => progress.push(percent)
  });
  assert.deepEqual(
    attempts.map((args) => args[args.indexOf('-c:v') + 1]),
    ['h264_qsv', 'h264_qsv', 'libx264']
  );
  assert.deepEqual(
    attempts.map((args) => args.includes('-hwaccel')),
    [true, false, false]
  );
  assert.equal(attempts[2][attempts[2].indexOf('-preset') + 1], 'faster');
  assert.ok(progress.every((value, index) => !index || value >= progress[index - 1]));
  assert.equal(fs.readFileSync(inputPath, 'utf8'), 'original');
  assert.equal(fs.readFileSync(output, 'utf8'), 'converted');
  assert.ok(!fs.readdirSync(directory).some((name) => name.includes('.tmp.')));
});

test('cancelling the accelerated decoder cleans partial files and starts no retry', async (t) => {
  const controller = new AbortController();
  let attempts = 0;
  const { directory, service, request } = setup(t, async (_ffmpeg, args) => {
    attempts++;
    fs.writeFileSync(args.at(-1), 'partial');
    controller.abort();
    const error = new Error('Cancelled');
    error.name = 'AbortError';
    throw error;
  });
  await assert.rejects(service.convert({ ...request, signal: controller.signal }), {
    name: 'AbortError'
  });
  assert.equal(attempts, 1);
  assert.deepEqual(fs.readdirSync(directory), ['Vidéo originale é.mp4']);
});

test('a final publication error cleans the temporary file without repeating an already successful encode', async (t) => {
  let attempts = 0;
  const { directory, inputPath, service, request } = setup(t, async (_ffmpeg, args) => {
    attempts++;
    return complete(args);
  });
  const blockedDestination = path.join(directory, 'blocked.mp4');
  fs.mkdirSync(blockedDestination);
  await assert.rejects(service.convert({ ...request, outputPath: blockedDestination }));
  assert.equal(attempts, 1);
  assert.equal(fs.readFileSync(inputPath, 'utf8'), 'original');
  assert.ok(!fs.readdirSync(directory).some((name) => name.includes('.tmp.')));
});
