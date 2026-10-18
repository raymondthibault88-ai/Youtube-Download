const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MediaService } = require('../electron/services/media.cjs');

test('a failed hardware encode retries in software with the same profile and preserves the input', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'video-v5-fallback-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const inputPath = path.join(directory, 'original.mp4');
  fs.writeFileSync(inputPath, 'original');
  const encoders = [];
  const service = new MediaService('/ffmpeg', {
    processRunner: async (_command, args) => {
      const encoder = args[args.indexOf('-c:v') + 1];
      encoders.push(encoder);
      if (encoder !== 'libx264') throw new Error('Hardware device lost');
      assert.equal(args[args.indexOf('-preset') + 1], 'faster');
      fs.writeFileSync(args[args.length - 1], 'converted');
      return { stdout: '', stderr: '' };
    }
  });
  service.detectHardwareEncoder = async () => 'h264_nvenc';
  const result = await service.convert({
    inputPath,
    outputDir: directory,
    targetHeight: 720,
    profileId: 'balanced',
    mediaInfo: { height: 1080, duration: 10, bitrate: 5000000 }
  });
  assert.deepEqual(encoders, ['h264_nvenc', 'libx264']);
  assert.equal(fs.readFileSync(inputPath, 'utf8'), 'original');
  assert.equal(fs.readFileSync(result, 'utf8'), 'converted');
  assert.ok(!fs.readdirSync(directory).some((name) => name.includes('.tmp.')));
});

test('cancelling hardware encoding never starts a software retry', async () => {
  const controller = new AbortController();
  let attempts = 0;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'video-v5-cancel-'));
  try {
    const service = new MediaService('/ffmpeg', {
      processRunner: async () => {
        attempts++;
        controller.abort();
        const error = new Error('Opération annulée.');
        error.name = 'AbortError';
        throw error;
      }
    });
    service.detectHardwareEncoder = async () => 'h264_nvenc';
    await assert.rejects(
      service.convert({
        inputPath: path.join(directory, 'input.mp4'),
        outputDir: directory,
        profileId: 'fast',
        mediaInfo: { height: 1080, duration: 10, bitrate: 5000000 },
        signal: controller.signal
      }),
      { name: 'AbortError' }
    );
    assert.equal(attempts, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('cancelling hardware detection stops probing and does not poison the next attempt', async () => {
  const controller = new AbortController();
  const attempts = [];
  const service = new MediaService('/ffmpeg', {
    processRunner: async (_command, args, options) => {
      attempts.push(args);
      if (args.includes('-encoders'))
        return { stdout: 'h264_nvenc h264_qsv h264_amf h264_videotoolbox' };
      assert.equal(options.signal?.aborted, false);
      if (options.signal === controller.signal) {
        controller.abort();
        const error = new Error('Opération annulée.');
        error.name = 'AbortError';
        throw error;
      }
      return { stdout: '' };
    }
  });
  await assert.rejects(service.detectHardwareEncoder(controller.signal), { name: 'AbortError' });
  assert.equal(attempts.length, 2, 'No other encoder may be probed after cancellation.');
  assert.ok(await service.detectHardwareEncoder(new AbortController().signal));
  assert.equal(attempts.length, 4, 'A later conversion can detect its encoder again.');
});
