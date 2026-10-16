const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { publishFile } = require('../electron/services/file-output.cjs');
const { runProcess, terminateAllProcesses, waitForPromise } = require('../electron/services/process-runner.cjs');
const { JobManager } = require('../electron/services/job-manager.cjs');
const { YouTubeService, buildAnalyzeArgs, buildDownloadArgs } = require('../electron/services/youtube.cjs');
const { MediaService } = require('../electron/services/media.cjs');
const { resolveFfmpegPath } = require('../electron/services/dependencies.cjs');

async function fixture(t) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'video-studio-test-'));
  t.after(() => fs.promises.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('publishing concurrent outputs preserves all existing files', async (t) => {
  const dir = await fixture(t);
  const destination = path.join(dir, 'Match.mp4');
  await fs.promises.writeFile(destination, 'original');
  const sources = [path.join(dir, 'a.tmp'), path.join(dir, 'b.tmp')];
  await Promise.all(sources.map((p, i) => fs.promises.writeFile(p, `new-${i}`)));
  const results = await Promise.all(sources.map((p) => publishFile(p, destination)));
  assert.equal(new Set(results).size, 2);
  assert.equal(await fs.promises.readFile(destination, 'utf8'), 'original');
  assert.deepEqual((await Promise.all(results.map(p => fs.promises.readFile(p, 'utf8')))).sort(), ['new-0', 'new-1']);
});

test('yt-dlp commands isolate configuration and plugins', () => {
  for (const args of [buildAnalyzeArgs('https://youtu.be/a'), buildDownloadArgs({ ffmpegPath: '/ffmpeg', formatSelector: '18', outputDir: '/out', url: 'https://youtu.be/a' })]) {
    assert.ok(args.includes('--ignore-config'));
    assert.ok(args.includes('--no-plugin-dirs'));
    assert.ok(args.includes('--socket-timeout'));
  }
});

function fakeYoutube(dir, { id = 'video-b', outside = false, fail = false } = {}) {
  return new YouTubeService({ ytDlpPath: 'fixture', ffmpegPath: 'fixture', mediaService: {}, processRunner: async (_command, args, options) => {
    const taskDir = args[args.indexOf('-P') + 1];
    assert.notEqual(taskDir, dir);
    const file = path.join(outside ? dir : taskDir, 'Match.mp4');
    if (!outside) await fs.promises.writeFile(file, 'new-video-b');
    if (fail) throw new Error('fixture download error');
    options.onStdout(Buffer.from(`__YTDLP_ID__:${id}\n__YTDLP_FILE__:${file}\n`));
    return { stdout: '', stderr: '', code: 0 };
  } });
}

for (const fallback of [false, true]) {
  test(`download uses the clients that supplied its analyzed format (fallback=${fallback})`, async t => {
    const dir = await fixture(t);
    const commands = [];
    const youtube = new YouTubeService({ ytDlpPath: 'fixture', ffmpegPath: 'fixture', mediaService: { remux: async file => file }, processRunner: async (_command, args, options) => {
      commands.push(args);
      if (args.includes('-J')) {
        if (fallback && args.includes('--extractor-args')) throw new Error('fast client unavailable');
        return { stdout: JSON.stringify({ id: 'b', formats: [{ format_id: '18', vcodec: 'avc1', acodec: 'mp4a', height: 360, ext: 'mp4' }] }) };
      }
      const file = path.join(args[args.indexOf('-P') + 1], 'Match.mp4');
      await fs.promises.writeFile(file, 'video');
      options.onStdout(Buffer.from(`__YTDLP_ID__:b\n__YTDLP_FILE__:${file}\n`));
      return { stdout: '', stderr: '', code: 0 };
    } });
    await youtube.analyze('https://youtu.be/b');
    await youtube.download({ url: 'https://youtu.be/b', videoId: 'b', formatId: '18', outputDir: dir }, undefined, () => {});
    const analysis = commands.filter(args => args.includes('-J')).at(-1);
    const download = commands.at(-1);
    const client = args => args.includes('--extractor-args') ? args[args.indexOf('--extractor-args') + 1] : null;
    assert.equal(client(download), client(analysis));
    assert.equal(download[download.indexOf('-f') + 1], '18');
  });
}

test('same-title download keeps the original and publishes the requested video', async (t) => {
  const dir = await fixture(t);
  const original = path.join(dir, 'Match.mp4');
  await fs.promises.writeFile(original, 'old-video-a');
  const result = await fakeYoutube(dir).download({ url: 'https://youtu.be/b', videoId: 'video-b', formatId: '137', mergeAudioIfNeeded: true, hasAudio: false, outputDir: dir }, undefined, () => {});
  assert.equal(await fs.promises.readFile(original, 'utf8'), 'old-video-a');
  assert.equal(path.basename(result.outputPath), 'Match 2.mp4');
  assert.equal(await fs.promises.readFile(result.outputPath, 'utf8'), 'new-video-b');
  assert.ok(!(await fs.promises.readdir(dir)).some(name => name.startsWith('.video-studio-')));
});

test('wrong video identity never publishes a result and cleans its working directory', async (t) => {
  const dir = await fixture(t);
  await assert.rejects(fakeYoutube(dir, { id: 'wrong' }).download({ url: 'https://youtu.be/b', videoId: 'video-b', formatId: '137', outputDir: dir }, undefined, () => {}), /ne correspond pas/);
  assert.deepEqual(await fs.promises.readdir(dir), []);
});

test('a reported path outside the download cannot move or remove another file', async (t) => {
  const dir = await fixture(t);
  await fs.promises.writeFile(path.join(dir, 'Match.mp4'), 'original');
  await assert.rejects(fakeYoutube(dir, { outside: true }).download({ url: 'https://youtu.be/b', videoId: 'video-b', formatId: '137', outputDir: dir }, undefined, () => {}), /en dehors/);
  assert.equal(await fs.promises.readFile(path.join(dir, 'Match.mp4'), 'utf8'), 'original');
  assert.deepEqual(await fs.promises.readdir(dir), ['Match.mp4']);
});

test('failed download removes only its own temporary files', async (t) => {
  const dir = await fixture(t);
  await fs.promises.writeFile(path.join(dir, 'personal.mp4'), 'untouched');
  await assert.rejects(fakeYoutube(dir, { fail: true }).download({ url: 'https://youtu.be/b', videoId: 'video-b', formatId: '137', outputDir: dir }, undefined, () => {}));
  assert.deepEqual(await fs.promises.readdir(dir), ['personal.mp4']);
});

test('progress ignores writes beside the task working directory', async (t) => {
  const dir = await fixture(t);
  const progress = [];
  const youtube = new YouTubeService({ ytDlpPath: 'fixture', ffmpegPath: 'fixture', mediaService: {}, processRunner: async (_command, args, options) => {
    const taskDir = args[args.indexOf('-P') + 1];
    const file = path.join(taskDir, 'Match.mp4');
    await fs.promises.writeFile(file, 'video');
    await fs.promises.writeFile(path.join(dir, 'unrelated.tmp'), Buffer.alloc(5000));
    await new Promise(resolve => setTimeout(resolve, 850));
    options.onStdout(Buffer.from(`__YTDLP_ID__:b\n__YTDLP_FILE__:${file}\n`));
    return { stdout: '', stderr: '', code: 0 };
  } });
  await youtube.download({ url: 'https://youtu.be/b', videoId: 'b', formatId: '137', mergeAudioIfNeeded: true, outputDir: dir, expectedSizeBytes: 1000 }, undefined, value => progress.push(value));
  assert.ok(progress.length > 0);
  assert.ok(progress.every(value => value.percent < 5));
});

test('new window continues receiving updates and completion after the old window closes', async () => {
  const jobs = new JobManager({ channel: 'test' });
  let closed = false;
  let finish;
  const events = [];
  const first = { isDestroyed: () => closed, send: () => {} };
  const second = { isDestroyed: () => false, send: (_channel, snapshot) => events.push(snapshot) };
  const running = jobs.start('download', first, () => new Promise(resolve => { finish = resolve; }));
  closed = true;
  jobs.subscribe(second);
  jobs.update(jobs.snapshot().id, { percent: 50 });
  finish({ ok: true });
  await running;
  assert.deepEqual(events.map(e => e.state), ['running', 'completed']);
  assert.ok(events[1].revision > events[0].revision);
});

test('analysis occupies the shared job guard and can be cancelled', async () => {
  const jobs = new JobManager({ channel: 'test' });
  const running = jobs.start('analysis', null, ({ signal }) => waitForPromise(new Promise(() => {}), signal));
  await assert.rejects(jobs.start('download', null, async () => ({})), /déjà en cours/);
  assert.equal(jobs.cancel(), true);
  await assert.rejects(running, { name: 'AbortError' });
  assert.equal(jobs.snapshot().state, 'cancelled');
});

test('process timeout stops the engine and reports a recoverable timeout', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 100 }), { name: 'TimeoutError' });
});

test('analysis deadline includes dependency preparation and reports failure rather than cancellation', async () => {
  const jobs = new JobManager({ channel: 'test' });
  await assert.rejects(jobs.start('analysis', null, ({ signal }) => waitForPromise(new Promise(() => {}), signal), { timeoutMs: 20 }), { name: 'TimeoutError' });
  assert.equal(jobs.snapshot().state, 'failed');
  assert.match(jobs.snapshot().error, /délai/);
});

test('cancellation stops descendants even when they ignore SIGTERM', async (t) => {
  const dir = await fixture(t);
  const marker = path.join(dir, 'heartbeat');
  const child = `const fs=require('node:fs');process.on('SIGTERM',()=>{});fs.writeFileSync(${JSON.stringify(marker)},'start');console.log('ready');setInterval(()=>fs.writeFileSync(${JSON.stringify(marker)},String(Date.now())),20);`;
  const parent = `const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e',${JSON.stringify(child)}]);c.stdout.once('data',()=>console.log(c.pid));setInterval(()=>{},1000);`;
  const controller = new AbortController();
  await assert.rejects(runProcess(process.execPath, ['-e', parent], { signal: controller.signal, timeoutMs: 10_000, onStdout: () => controller.abort() }), { name: 'AbortError' });
  const after = await fs.promises.readFile(marker, 'utf8');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await fs.promises.readFile(marker, 'utf8'), after);
});

test('application shutdown waits for active engines to stop', async () => {
  let ready;
  const started = new Promise(resolve => { ready = resolve; });
  const running = runProcess(process.execPath, ['-e', "console.log('ready');setInterval(()=>{},1000)"], { onStdout: ready });
  const outcome = assert.rejects(running, { name: 'AbortError' });
  await started;
  await terminateAllProcesses();
  await outcome;
});

test('odd dimensions encode to even H264 dimensions without modifying the original', async (t) => {
  const dir = await fixture(t);
  const binary = resolveFfmpegPath({ isPackaged: false });
  const source = path.join(dir, 'odd.mkv');
  await runProcess(binary, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=641x361:rate=25', '-t', '0.2', '-c:v', 'ffv1', source]);
  const before = await fs.promises.readFile(source);
  const media = new MediaService(binary);
  const result = await media.convert({ inputPath: source, outputDir: dir, profileId: 'compact', mediaInfo: await media.inspect(source) });
  assert.deepEqual(await fs.promises.readFile(source), before);
  const output = await media.inspect(result);
  assert.equal(output.width, 642);
  assert.equal(output.height, 362);
  await runProcess(binary, ['-v', 'error', '-i', result, '-f', 'null', '-']);
});

test('hardware failure retries CPU once, while cancellation never retries', async (t) => {
  const dir = await fixture(t);
  const calls = [];
  const controller = new AbortController();
  let abort = false;
  const media = new MediaService('fixture', { processRunner: async (_command, args) => {
    const codec = args[args.indexOf('-c:v') + 1];
    calls.push(codec);
    if (codec !== 'libx264') {
      if (abort) controller.abort();
      throw new Error('h264_nvenc: hardware encoder initialization failed');
    }
    await fs.promises.writeFile(args.at(-1), 'output');
    return { stdout: '', stderr: '', code: 0 };
  } });
  media.hardwareEncoderPromise = Promise.resolve('h264_nvenc');
  const payload = { inputPath: path.join(dir, 'source.mp4'), outputDir: dir, mediaInfo: { width: 640, height: 360, duration: 1, bitrate: 1_000_000 } };
  await media.convert(payload);
  assert.deepEqual(calls, ['h264_nvenc', 'libx264']);
  calls.length = 0;
  media.hardwareEncoderPromise = Promise.resolve('h264_nvenc');
  abort = true;
  await assert.rejects(media.convert({ ...payload, signal: controller.signal }));
  assert.deepEqual(calls, ['h264_nvenc']);
});

test('portrait rotation metadata is respected when reducing the displayed height', async (t) => {
  const dir = await fixture(t);
  const binary = resolveFfmpegPath({ isPackaged: false });
  const landscape = path.join(dir, 'landscape.mp4');
  const portrait = path.join(dir, 'portrait.mp4');
  await runProcess(binary, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-t', '0.2', '-c:v', 'libx264', landscape]);
  await runProcess(binary, ['-y', '-v', 'error', '-display_rotation', '90', '-i', landscape, '-c', 'copy', portrait]);
  const media = new MediaService(binary);
  const info = await media.inspect(portrait);
  assert.equal(info.width, 360);
  assert.equal(info.height, 640);
  const output = await media.convert({ inputPath: portrait, outputDir: dir, targetHeight: 480, profileId: 'compact', mediaInfo: info });
  const dimensions = await media.inspect(output);
  assert.equal(dimensions.width, 270);
  assert.equal(dimensions.height, 480);
  await runProcess(binary, ['-v', 'error', '-i', output, '-f', 'null', '-']);
});

test('cancelling a real FFmpeg conversion removes partial output and preserves the source', async (t) => {
  const dir = await fixture(t);
  const binary = resolveFfmpegPath({ isPackaged: false });
  const source = path.join(dir, 'source.mkv');
  await runProcess(binary, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-t', '1', '-c:v', 'ffv1', source]);
  const original = await fs.promises.readFile(source);
  const media = new MediaService(binary);
  const controller = new AbortController();
  await assert.rejects(media.convert({ inputPath: source, outputDir: dir, profileId: 'compact', mediaInfo: await media.inspect(source), signal: controller.signal, onProgress: () => controller.abort() }), { name: 'AbortError' });
  assert.deepEqual(await fs.promises.readdir(dir), ['source.mkv']);
  assert.deepEqual(await fs.promises.readFile(source), original);
});

test('cancelling during a real FFmpeg merge leaves no task files or damaged existing files', async (t) => {
  const dir = await fixture(t);
  const binary = resolveFfmpegPath({ isPackaged: false });
  const video = path.join(dir, 'video.mp4');
  const audio = path.join(dir, 'audio.m4a');
  await runProcess(binary, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25', '-t', '2', '-c:v', 'libx264', video]);
  await runProcess(binary, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '2', '-c:a', 'aac', audio]);
  const beforeVideo = await fs.promises.readFile(video);
  const beforeAudio = await fs.promises.readFile(audio);
  const controller = new AbortController();
  const youtube = new YouTubeService({ ytDlpPath: 'fixture', ffmpegPath: binary, mediaService: {}, processRunner: (_command, args, options) => {
    const destination = path.join(args[args.indexOf('-P') + 1], 'Match.mp4');
    const mergeArgs = ['-y', '-v', 'error', '-re', '-i', video, '-re', '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-progress', 'pipe:1', destination];
    const parent = `const {spawn}=require('node:child_process');const c=spawn(${JSON.stringify(binary)},${JSON.stringify(mergeArgs)});c.stdout.on('data',()=>console.log('__YTDLP_PROGRESS__:5%|1KiB/s|10s'));c.stderr.pipe(process.stderr);c.on('close',code=>process.exit(code??1));`;
    return runProcess(process.execPath, ['-e', parent], options);
  } });
  await assert.rejects(youtube.download({ url: 'https://youtu.be/b', videoId: 'b', formatId: '137', outputDir: dir }, controller.signal, () => controller.abort()), { name: 'AbortError' });
  assert.deepEqual((await fs.promises.readdir(dir)).sort(), ['audio.m4a', 'video.mp4']);
  assert.deepEqual(await fs.promises.readFile(video), beforeVideo);
  assert.deepEqual(await fs.promises.readFile(audio), beforeAudio);
});
