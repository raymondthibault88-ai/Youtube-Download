const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { YouTubeService, canReuseAnalysis, canRemuxCompatibleMp4 } = require('../electron/services/youtube.cjs');

const url = 'https://www.youtube.com/watch?v=abcdefghijk';
const metadata = () => ({ id: 'abcdefghijk', title: 'Été à Dijon', webpage_url: url, duration: 30,
  formats: [
    { format_id: '137', height: 1080, fps: 30, ext: 'mp4', vcodec: 'avc1.640028', acodec: 'none', url: 'https://example.invalid/video?signature=private' },
    { format_id: '401', height: 2160, fps: 60, ext: 'mp4', vcodec: 'av01.0.13M.08', acodec: 'none', url: 'https://example.invalid/4k' },
    { format_id: '140', ext: 'm4a', vcodec: 'none', acodec: 'mp4a.40.2', url: 'https://example.invalid/audio' }
  ] });

function setup(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'video-v5-download-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const calls = [];
  const payload = { url, outputDir: directory, formatId: '137', hasVideo: true, hasAudio: false, mergeAudioIfNeeded: true, shouldRecodeToMp4: false, ...overrides };
  const service = new YouTubeService({ ytDlpPath: '/yt-dlp', ffmpegPath: '/ffmpeg', mediaService: {}, processRunner: async (_command, args, options) => {
    calls.push(args);
    if (args.includes('-J')) return { stdout: JSON.stringify(metadata()) };
    const file = path.join(args[args.indexOf('-P') + 1], 'Été à Dijon.mp4');
    fs.writeFileSync(file, 'original streams');
    // A final line without a newline must still preserve the accented title.
    options.onStdout(Buffer.from(`__YTDLP_FILE__:${file}`));
    return { stdout: '', stderr: '' };
  } });
  return { directory, payload, service, calls };
}

for (const formatId of ['137', '401']) {
  test(`fresh analysis downloads the exact ${formatId} video with the existing audio selection, without re-extraction`, async t => {
    const { service, calls, payload, directory } = setup(t, { formatId });
    const publicInfo = await service.analyze(url);
    assert.equal(publicInfo.formats.find(format => format.id === formatId).fps, formatId === '401' ? 60 : 30);
    assert.equal(JSON.stringify(publicInfo).includes('signature=private'), false);
    const delegate = service.runProcess;
    service.runProcess = async (command, args, options) => {
      const storedPath = args[args.indexOf('--load-info-json') + 1];
      assert.equal(path.dirname(storedPath).startsWith(directory), true);
      assert.deepEqual(JSON.parse(fs.readFileSync(storedPath, 'utf8')), metadata());
      assert.equal(args.includes(url), false);
      assert.equal(args[args.indexOf('-f') + 1], `${formatId}+bestaudio[ext=m4a]/${formatId}+bestaudio/${formatId}`);
      return delegate(command, args, options);
    };
    const result = await service.download(payload);
    assert.equal(calls.length, 3);
    assert.equal(calls[2].includes('--extractor-args'), false);
    assert.equal(fs.readFileSync(result.outputPath, 'utf8'), 'original streams');
    assert.deepEqual(fs.readdirSync(directory), ['Été à Dijon.mp4']);
  });
}

test('expired URLs, stale metadata, live fragments and missing format IDs use fresh extraction', () => {
  const now = Date.now();
  const entry = () => ({ at: now, info: metadata() });
  const payload = { formatId: '137', hasVideo: true, hasAudio: false };
  assert.equal(canReuseAnalysis(entry(), payload, now), true);
  for (const expirySeconds of [-1, 30]) {
    const cached = entry();
    cached.info.formats[2].url += `?expire=${Math.floor(now / 1000) + expirySeconds}`;
    assert.equal(canReuseAnalysis(cached, payload, now), false);
  }
  const stale = entry(); stale.at -= 600000;
  assert.equal(canReuseAnalysis(stale, payload, now), false);
  for (const live_status of ['is_live', 'is_upcoming', 'post_live']) {
    const live = entry(); live.info.live_status = live_status;
    assert.equal(canReuseAnalysis(live, payload, now), false);
  }
  const fragments = entry();
  fragments.info.formats[0].fragments = [{ url: `https://example.invalid/fragment?expire=${Math.floor(now / 1000) - 1}` }];
  assert.equal(canReuseAnalysis(fragments, payload, now), false);
  assert.equal(canReuseAnalysis(entry(), { formatId: 'missing' }, now), false);
  assert.equal(canReuseAnalysis(null, payload, now), false);
});

test('a stale signed link retries the same formats once and preserves progress and existing exports', async t => {
  const { service, calls, payload, directory } = setup(t);
  await service.analyze(url);
  const existing = path.join(directory, 'Été à Dijon.mp4');
  fs.writeFileSync(existing, 'keep existing');
  const delegate = service.runProcess;
  let failures = 0;
  service.runProcess = async (command, args, options) => {
    if (args.includes('--load-info-json')) {
      failures++;
      options.onStdout(Buffer.from('__YTDLP_PROGRESS__:{"id":"137","percent":"90%"}\n'));
      throw new Error('HTTP Error 403: Forbidden');
    }
    assert.equal(args.at(-1), url);
    assert.equal(args[args.indexOf('-f') + 1], '137+bestaudio[ext=m4a]/137+bestaudio/137');
    options.onStdout(Buffer.from('__YTDLP_PROGRESS__:{"id":"137","percent":"1%"}\n'));
    return delegate(command, args, options);
  };
  const progress = [];
  const result = await service.download(payload, undefined, update => progress.push(update.percent));
  assert.equal(failures, 1);
  assert.equal(calls.length, 3);
  assert.equal(service.cache.has(url), false);
  assert.equal(path.basename(result.outputPath), 'Été à Dijon (2).mp4');
  assert.equal(fs.readFileSync(existing, 'utf8'), 'keep existing');
  assert.ok(progress.every((percent, index) => !index || percent >= progress[index - 1]));
  assert.equal(fs.readdirSync(directory).length, 2);
});

for (const name of ['AbortError', 'Error']) {
  test(`${name === 'AbortError' ? 'cancellation' : 'disk errors'} never restart a cached download`, async t => {
    const { service, payload, directory } = setup(t);
    await service.analyze(url);
    let attempts = 0;
    service.runProcess = async () => { attempts++; const error = new Error(name === 'AbortError' ? 'HTTP Error 403: Forbidden' : 'ENOSPC: no space left on device'); error.name = name; throw error; };
    await assert.rejects(service.download(payload), { name });
    assert.equal(attempts, 1);
    assert.deepEqual(fs.readdirSync(directory), []);
  });
}

test('analysis fallback retains the default client configuration during download', async t => {
  const { service, payload } = setup(t);
  const delegate = service.runProcess;
  let attemptedFast = false;
  service.runProcess = async (command, args, options) => {
    if (args.includes('-J') && args.includes('--extractor-args') && !attemptedFast) { attemptedFast = true; throw new Error('Client unavailable'); }
    if (!args.includes('-J')) assert.equal(args.includes('--extractor-args'), false);
    return delegate(command, args, options);
  };
  await service.analyze(url);
  await service.download(payload);
});

test('parallel analysis preserves the visible format list and the previous default audio choice', async t => {
  const { service, payload } = setup(t);
  const delegate = service.runProcess;
  const pending = [];
  service.runProcess = (command, args, options) => {
    if (args.includes('-J')) return new Promise(resolve => pending.push({ args, resolve }));
    const saved = JSON.parse(fs.readFileSync(args[args.indexOf('--load-info-json') + 1], 'utf8'));
    assert.equal(saved.formats.some(format => format.format_id === '258'), false, 'Do not change stereo audio to a fast-client 5.1 stream.');
    assert.equal(saved.formats.find(format => format.format_id === '140').url, 'https://example.invalid/reusable-audio');
    assert.equal(saved.formats.find(format => format.format_id === '137').url, metadata().formats[0].url, 'A different frame rate must not replace the selected video transport.');
    assert.equal(args.includes('--extractor-args'), false);
    return delegate(command, args, options);
  };
  const analysis = service.analyze(url);
  assert.equal(pending.length, 2, 'Both extractions must start before awaiting either one.');
  for (const { args, resolve } of pending) {
    const info = metadata();
    if (args.includes('--extractor-args')) {
      info.formats[0].fps = 60;
      info.formats[0].url = 'https://example.invalid/different-video';
      info.formats[2].url = 'https://example.invalid/reusable-audio';
      info.formats.push({ ...info.formats[0], format_id: '136', height: 720 }, { ...info.formats[2], format_id: '258', audio_channels: 6 });
    }
    resolve({ stdout: JSON.stringify(info) });
  }
  const publicInfo = await analysis;
  assert.ok(publicInfo.formats.some(format => format.id === '136'));
  await service.download(payload);
});

test('an unavailable default-client analysis never substitutes fast-client audio', async t => {
  const { service, payload } = setup(t);
  const delegate = service.runProcess;
  service.runProcess = async (command, args, options) => {
    if (args.includes('-J') && !args.includes('--extractor-args')) throw new Error('Temporary default client error');
    if (!args.includes('-J')) {
      assert.equal(args.includes('--load-info-json'), false);
      assert.equal(args.includes('--extractor-args'), false);
      assert.equal(args.at(-1), url);
    }
    return delegate(command, args, options);
  };
  await service.analyze(url);
  await service.download(payload);
});

test('formats display before preparation ends, and cancelling its waiting download aborts preparation', async t => {
  const { service, payload, directory } = setup(t);
  const delegate = service.runProcess;
  let preparingSignal;
  let transfers = 0;
  service.runProcess = (command, args, options) => {
    if (args.includes('-J') && !args.includes('--extractor-args')) {
      preparingSignal = options.signal;
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => { const error = new Error('Cancelled'); error.name = 'AbortError'; reject(error); }, { once: true }));
    }
    if (!args.includes('-J')) transfers++;
    return delegate(command, args, options);
  };
  assert.equal((await service.analyze(url)).title, 'Été à Dijon');
  assert.equal(preparingSignal.aborted, false);
  const controller = new AbortController();
  const download = service.download(payload, controller.signal);
  controller.abort();
  await assert.rejects(download, { name: 'AbortError' });
  assert.equal(preparingSignal.aborted, true);
  assert.equal(transfers, 0);
  assert.deepEqual(fs.readdirSync(directory), []);
});

test('changing the video stops unused metadata preparation from the previous link', async t => {
  const { service } = setup(t);
  const preparingSignals = [];
  service.runProcess = async (_command, args, options) => {
    if (!args.includes('--extractor-args')) {
      preparingSignals.push(options.signal);
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => { const error = new Error('Cancelled'); error.name = 'AbortError'; reject(error); }, { once: true }));
    }
    return { stdout: JSON.stringify(metadata()) };
  };
  await service.analyze(url);
  const controller = new AbortController();
  await service.analyze('https://youtu.be/anotherLink', controller.signal);
  assert.equal(preparingSignals[0].aborted, true);
  controller.abort();
  await Promise.all([...service.cache.values()].map(entry => entry.preparingInfo));
  assert.equal(preparingSignals[1].aborted, true);
  assert.equal(service.preparingAnalyses.size, 0);
});

test('only known compatible H.264/AAC SDR media bypasses encoding', () => {
  const compatible = { codec: 'h264', pixelFormat: 'yuv420p', audioCodec: 'aac', hasAudio: true };
  assert.equal(canRemuxCompatibleMp4(compatible), true);
  assert.equal(canRemuxCompatibleMp4({ ...compatible, hasAudio: false, audioCodec: null }), true);
  for (const difference of [{ codec: 'vp9' }, { codec: 'av1' }, { audioCodec: 'opus' }, { pixelFormat: 'yuv420p10le' }, { highDynamicRange: true }, { rotation: 90 }, { interlaced: true }, { audioCodec: null }]) {
    assert.equal(canRemuxCompatibleMp4({ ...compatible, ...difference }), false);
  }
  assert.equal(canRemuxCompatibleMp4({}), false);
});

for (const remuxFails of [false, true, 'cancel']) {
  test(`a compatible non-MP4 download ${remuxFails === false ? 'copies streams without encoding' : remuxFails === true ? 'falls back to encoding if remux fails' : 'does not retry a cancelled remux'}`, async t => {
    const { service, payload, directory } = setup(t, { shouldRecodeToMp4: true });
    let conversions = 0;
    let remuxes = 0;
    service.mediaService = {
      inspect: async () => ({ codec: 'h264', pixelFormat: 'yuv420p', audioCodec: 'aac', hasAudio: true }),
      remux: async (input, _signal, onProgress) => {
        remuxes++;
        onProgress({ percent: 98, stage: 'finalize' });
        if (remuxFails) { const error = new Error('Remux failed'); if (remuxFails === 'cancel') error.name = 'AbortError'; throw error; }
        return input;
      },
      convert: async ({ inputPath, onProgress, targetHeight, profileId }) => {
        conversions++;
        assert.equal(targetHeight, null);
        assert.equal(profileId, 'fast');
        onProgress({ percent: 82, stage: 'convert' });
        return inputPath;
      }
    };
    const progress = [];
    const operation = service.download(payload, undefined, update => progress.push(update.percent));
    if (remuxFails === 'cancel') await assert.rejects(operation, { name: 'AbortError' });
    else assert.equal(fs.readFileSync((await operation).outputPath, 'utf8'), 'original streams');
    assert.equal(remuxes, 1);
    assert.equal(conversions, remuxFails === true ? 1 : 0);
    assert.ok(progress.every((percent, index) => !index || percent >= progress[index - 1]));
    assert.equal(fs.readdirSync(directory).length, remuxFails === 'cancel' ? 0 : 1);
  });
}
