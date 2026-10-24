const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { Transform } = require('node:stream');
const nodeCrypto = require('node:crypto');
const ffmpeg = require('ffmpeg-static');
const { runProcess } = require('../electron/services/process-runner.cjs');
const { MediaService } = require('../electron/services/media.cjs');
const { YouTubeService } = require('../electron/services/youtube.cjs');
const {
  median,
  validateResumeCompatibility,
  validateResumeCases
} = require('./download-benchmark-resume.cjs');

const directory = path.resolve(process.env.V5_DOWNLOAD_DIR || 'test-results/download');
const baselinePath = process.env.V5_DOWNLOAD_BASELINE;
const ytDlpPath = process.env.V5_YTDLP_PATH;
const baselineYtDlpPath = process.env.V5_BASELINE_YTDLP_PATH || ytDlpPath;
const compareCurrent = process.env.V5_DOWNLOAD_COMPARE_CURRENT === '1';
const repetitions = Number(process.env.V5_DOWNLOAD_REPETITIONS || 3);
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const hash = (file) => nodeCrypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function engineHashes(entryPath) {
  const serviceDirectory = path.dirname(entryPath);
  const files = { 'youtube.cjs': hash(entryPath) };
  const visit = (relative) => {
    const absolute = path.join(serviceDirectory, relative);
    if (fs.statSync(absolute).isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) visit(path.join(relative, name));
    } else if (relative.endsWith('.cjs')) {
      files[relative.split(path.sep).join('/')] = hash(absolute);
    }
  };
  for (const relative of ['youtube', 'media.cjs', 'media', 'process-runner.cjs'])
    if (fs.existsSync(path.join(serviceDirectory, relative))) visit(relative);
  for (const name of ['download-config.json', 'youtube-config.json', 'conversion-config.json']) {
    const filename = path.resolve(serviceDirectory, '../../shared', name);
    if (fs.existsSync(filename)) files[`shared/${name}`] = hash(filename);
  }
  return files;
}
const runFfmpeg = (args, options = {}) =>
  runProcess(ffmpeg, ['-hide_banner', ...args], {
    signal: AbortSignal.timeout(600000),
    outputLimit: 1024 * 1024,
    ...options
  });
const report = {
  runId,
  environment: { ytDlpPath, node: process.version, platform: process.platform },
  methodology: {
    repetitions,
    analysisExcludedFromDownloadTimer: true,
    localMetadataLatencyMs: 250,
    localFragmentLatencyMs: 80,
    localPerConnectionLimitMiBps: 25,
    caveat: 'Controlled localhost results do not predict YouTube throughput.'
  },
  cases: []
};
const save = () =>
  fs.writeFileSync(
    path.join(directory, 'download-benchmark.json'),
    JSON.stringify(report, null, 2)
  );

async function loggedProcess(command, args, options = {}) {
  let stdout = '';
  let stderr = '';
  try {
    return await runProcess(command, args, {
      ...options,
      onStdout: (chunk) => {
        stdout += chunk.toString();
        options.onStdout?.(chunk);
      },
      onStderr: (chunk) => {
        stderr += chunk.toString();
        options.onStderr?.(chunk);
      }
    });
  } catch (error) {
    fs.writeFileSync(
      path.join(directory, 'failed-process.json'),
      JSON.stringify({ command, args, stdout, stderr }, null, 2)
    );
    throw error;
  }
}

async function streamHashes(file) {
  const { stdout } = await runFfmpeg([
    '-loglevel',
    'error',
    '-i',
    file,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-c',
    'copy',
    '-f',
    'streamhash',
    '-hash',
    'sha256',
    '-'
  ]);
  return stdout.trim();
}

async function validate(file, source, height, decode = true, exactStreams = true) {
  const media = await new MediaService(ffmpeg).inspect(file);
  assert.equal(media.height, height);
  assert.equal(media.codec, 'h264');
  assert.equal(media.audioCodec, 'aac');
  assert.ok(Math.abs(media.duration - source.duration) < 0.1);
  const streams = await streamHashes(file);
  if (exactStreams)
    assert.equal(
      streams,
      source.streamHashes,
      'Video and audio compressed packets must be unchanged.'
    );
  let frames;
  if (decode) {
    const { stdout } = await runFfmpeg([
      '-loglevel',
      'error',
      '-xerror',
      '-i',
      file,
      '-progress',
      'pipe:1',
      '-nostats',
      '-f',
      'null',
      '-'
    ]);
    frames = Number([...stdout.matchAll(/^frame=(\d+)/gm)].at(-1)?.[1]);
    assert.equal(frames, Math.round(source.duration * 30));
  }
  return {
    validated: true,
    height,
    codec: media.codec,
    audioCodec: media.audioCodec,
    duration: media.duration,
    frames,
    compressedStreamsIdentical: streams === source.streamHashes,
    streamHashes: streams,
    bytes: fs.statSync(file).size
  };
}

async function prepare() {
  const fixtures = path.join(directory, 'sources');
  fs.mkdirSync(fixtures, { recursive: true });
  const sources = [];
  for (const [label, height, width] of [
    ['1080p', 1080, 1920],
    ['4K', 2160, 3840]
  ]) {
    const provided =
      process.env.V5_DOWNLOAD_SOURCE_DIR &&
      path.join(process.env.V5_DOWNLOAD_SOURCE_DIR, `Mouvement ${label} é.mp4`);
    const source = provided || path.join(fixtures, `Mouvement ${label} é.mp4`);
    if (!fs.existsSync(source))
      await runFfmpeg([
        '-y',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        `testsrc2=size=${width}x${height}:rate=30`,
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=48000',
        '-t',
        '12',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
        '-g',
        '30',
        '-threads',
        '8',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        source
      ]);
    const folder = path.join(fixtures, label);
    fs.mkdirSync(folder, { recursive: true });
    const manifest = path.join(folder, 'stream.m3u8');
    await runFfmpeg(
      [
        '-y',
        '-loglevel',
        'error',
        '-i',
        source,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0',
        '-c',
        'copy',
        '-f',
        'hls',
        '-hls_time',
        '1',
        '-hls_playlist_type',
        'vod',
        '-hls_segment_type',
        'fmp4',
        '-hls_flags',
        'split_by_time',
        '-hls_segment_filename',
        path.join(folder, 'fragment-%03d.m4s'),
        '-hls_fmp4_init_filename',
        'init.mp4',
        manifest
      ],
      { cwd: folder }
    );
    fs.writeFileSync(
      path.join(folder, 'master.m3u8'),
      `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=50000000,RESOLUTION=${width}x${height},FRAME-RATE=30,CODECS="avc1.640033,mp4a.40.2"\nstream.m3u8\n`
    );
    fs.writeFileSync(
      path.join(folder, 'index.html'),
      `<!doctype html><title>Téléchargement ${label} é</title><video controls><source src="master.m3u8" type="application/x-mpegURL"></video>`
    );
    const matroska = path.join(folder, 'compatible.mkv');
    await runFfmpeg([
      '-y',
      '-loglevel',
      'error',
      '-i',
      source,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0',
      '-c',
      'copy',
      matroska
    ]);
    sources.push({
      label,
      height,
      width,
      path: source,
      folder,
      sha256: hash(source),
      ...(await new MediaService(ffmpeg).inspect(source)),
      streamHashes: await streamHashes(source)
    });
  }
  return { fixtures, sources };
}

async function localBenchmark() {
  assert.ok(
    ytDlpPath && fs.existsSync(ytDlpPath),
    'Set V5_YTDLP_PATH to the verified yt-dlp binary.'
  );
  assert.ok(
    baselinePath && fs.existsSync(baselinePath),
    'Set V5_DOWNLOAD_BASELINE to the saved original youtube.cjs.'
  );
  assert.ok(baselineYtDlpPath && fs.existsSync(baselineYtDlpPath));
  assert.ok(Number.isInteger(repetitions) && repetitions > 0 && repetitions <= 10);
  fs.mkdirSync(directory, { recursive: true });
  const previous = process.env.V5_DOWNLOAD_RESUME
    ? JSON.parse(fs.readFileSync(process.env.V5_DOWNLOAD_RESUME, 'utf8'))
    : null;
  const BaselineService = require(path.resolve(baselinePath)).YouTubeService;
  const baselineFragments = compareCurrent
    ? require(path.resolve(path.dirname(baselinePath), '../../shared/download-config.json'))
        .concurrentFragments
    : 4;
  const currentFragments = require('../shared/download-config.json').concurrentFragments;
  const variantDefinitions = compareCurrent
    ? [
        ['baseline', BaselineService, baselineFragments, baselineYtDlpPath],
        ['optimized', YouTubeService, currentFragments, ytDlpPath]
      ]
    : [
        ['baseline', BaselineService, 4, baselineYtDlpPath],
        ['cached-4', YouTubeService, 4, ytDlpPath],
        ['cached-8', YouTubeService, 8, ytDlpPath]
      ];
  report.comparison = {
    mode: compareCurrent ? 'current-baseline-versus-updated' : 'historical-fragment-comparison',
    baselineEngineSha256: hash(baselinePath),
    updatedEngineSha256: hash(path.resolve(__dirname, '../electron/services/youtube.cjs')),
    baselineEngineFiles: engineHashes(path.resolve(baselinePath)),
    updatedEngineFiles: engineHashes(path.resolve(__dirname, '../electron/services/youtube.cjs')),
    baselineBinarySha256: hash(baselineYtDlpPath),
    updatedBinarySha256: hash(ytDlpPath),
    ffmpegBinarySha256: hash(ffmpeg),
    fragments: Object.fromEntries(
      variantDefinitions.map(([name, , fragments]) => [name, fragments])
    )
  };
  if (previous) validateResumeCompatibility(previous, report);
  const { sources, fixtures } = await prepare();
  report.sources = sources;
  if (previous) {
    validateResumeCases(previous, report);
    report.resumedFragmentedFrom = path.resolve(process.env.V5_DOWNLOAD_RESUME);
  }
  save();
  let requestLog = [];
  const server = http.createServer((request, response) => {
    const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(
      /^\/+/,
      ''
    );
    const file = path.resolve(fixtures, relative);
    if (
      !file.startsWith(fixtures + path.sep) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    ) {
      response.writeHead(404).end();
      return;
    }
    const metadata = /\.(html|m3u8)$/.test(file);
    requestLog.push({ path: relative, at: performance.now(), media: !metadata });
    const type = {
      '.html': 'text/html; charset=utf-8',
      '.m3u8': 'application/vnd.apple.mpegurl',
      '.m4s': 'video/mp4',
      '.mp4': 'video/mp4',
      '.mkv': 'video/x-matroska'
    }[path.extname(file)];
    setTimeout(
      () => {
        if (response.destroyed) return;
        response.writeHead(200, { 'Content-Type': type, 'Content-Length': fs.statSync(file).size });
        if (request.method === 'HEAD') {
          response.end();
          return;
        }
        const stream = fs.createReadStream(file, { highWaterMark: 256 * 1024 });
        const throttle = new Transform({
          transform(chunk, _encoding, callback) {
            setTimeout(() => callback(null, chunk), metadata ? 0 : 10);
          }
        });
        response.on('close', () => {
          stream.destroy();
          throttle.destroy();
        });
        stream.pipe(throttle).pipe(response);
      },
      metadata ? 250 : 80
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const source of sources) {
      const completed = previous?.cases.find((entry) => entry.id === `${source.label}-fragmented`);
      if (completed)
        assert.equal(
          previous.sources.find((entry) => entry.label === source.label).sha256,
          source.sha256
        );
      const trials = completed?.trials || [];
      for (let repetition = 0; !completed && repetition < repetitions; repetition++) {
        const variants = [...variantDefinitions];
        if (repetition % 2) variants.reverse();
        for (const [variant, Service, concurrentFragments, binary] of variants) {
          const outputDir = path.join(
            directory,
            'outputs',
            runId,
            source.label,
            `${repetition}-${variant}`
          );
          fs.mkdirSync(outputDir, { recursive: true });
          const service = new Service({
            ytDlpPath: binary,
            ffmpegPath: ffmpeg,
            mediaService: new MediaService(ffmpeg),
            concurrentFragments,
            processRunner: loggedProcess
          });
          const url = `${origin}/${source.label}/index.html`;
          const analysis = await service.analyze(url);
          const format =
            analysis.formats.find(
              (format) => format.resolution === `${source.width}x${source.height}`
            ) || analysis.formats[0];
          assert.ok(format?.quickTimeCompatible);
          const progress = [];
          requestLog = [];
          const started = performance.now();
          const result = await service.download(
            {
              url,
              outputDir,
              formatId: format.id,
              hasVideo: format.hasVideo,
              hasAudio: format.hasAudio,
              mergeAudioIfNeeded: !format.hasAudio,
              shouldRecodeToMp4: false
            },
            AbortSignal.timeout(120000),
            (update) => progress.push(update.percent)
          );
          const seconds = (performance.now() - started) / 1000;
          const requests = [...requestLog];
          assert.ok(progress.every((value, index) => !index || value >= progress[index - 1]));
          assert.ok(!fs.readdirSync(outputDir).some((name) => name.startsWith('.youtube-')));
          const quality = await validate(
            result.outputPath,
            source,
            source.height,
            repetition === 0
          );
          const trial = {
            repetition,
            variant,
            concurrentFragments,
            seconds,
            timeToFirstMediaRequest:
              (requests.find((request) => request.media)?.at - started) / 1000,
            metadataRequestsDuringDownload: requests.filter((request) => !request.media).length,
            mediaRequests: requests.filter((request) => request.media).length,
            outputPath: result.outputPath,
            quality
          };
          trials.push(trial);
          console.log(
            JSON.stringify({
              label: source.label,
              ...trial,
              quality: {
                compressedStreamsIdentical: quality.compressedStreamsIdentical,
                frames: quality.frames
              }
            })
          );
        }
      }
      report.cases.push({
        id: `${source.label}-fragmented`,
        trials,
        medians: Object.fromEntries(
          variantDefinitions.map(([variant]) => [
            variant,
            {
              seconds: median(
                trials.filter((trial) => trial.variant === variant).map((trial) => trial.seconds)
              ),
              timeToFirstMediaRequest: median(
                trials
                  .filter((trial) => trial.variant === variant)
                  .map((trial) => trial.timeToFirstMediaRequest)
              )
            }
          ])
        )
      });
      save();
      const completedContainer = previous?.cases.find(
        (entry) => entry.id === `${source.label}-compatible-container`
      );
      const remuxTrials = completedContainer?.trials || [];
      for (const [variant, Service, binary] of [
        ['baseline', BaselineService, baselineYtDlpPath],
        ['optimized', YouTubeService, ytDlpPath]
      ]) {
        if (completedContainer) break;
        const outputDir = path.join(
          directory,
          'outputs',
          runId,
          source.label,
          `${variant}-container`
        );
        fs.mkdirSync(outputDir, { recursive: true });
        const service = new Service({
          ytDlpPath: binary,
          ffmpegPath: ffmpeg,
          mediaService: new MediaService(ffmpeg),
          processRunner: loggedProcess
        });
        const url = `${origin}/${source.label}/compatible.mkv`;
        const started = performance.now();
        const result = await service.download(
          {
            url,
            outputDir,
            formatId: 'best',
            hasVideo: true,
            hasAudio: true,
            shouldRecodeToMp4: true
          },
          AbortSignal.timeout(180000),
          () => {}
        );
        const seconds = (performance.now() - started) / 1000;
        const quality = await validate(
          result.outputPath,
          source,
          source.height,
          true,
          variant === 'optimized' || compareCurrent
        );
        remuxTrials.push({ variant, seconds, outputPath: result.outputPath, quality });
      }
      report.cases.push({ id: `${source.label}-compatible-container`, trials: remuxTrials });
      assert.equal(hash(source.path), source.sha256);
      save();
    }
    const cancelledDir = path.join(directory, 'outputs', runId, 'cancelled');
    fs.mkdirSync(cancelledDir, { recursive: true });
    const existing = path.join(cancelledDir, 'Export existant.mp4');
    fs.writeFileSync(existing, 'preserve existing export');
    const service = new YouTubeService({
      ytDlpPath,
      ffmpegPath: ffmpeg,
      mediaService: new MediaService(ffmpeg),
      concurrentFragments: 8
    });
    const url = `${origin}/4K/index.html`;
    const format = (await service.analyze(url)).formats[0];
    const controller = new AbortController();
    await assert.rejects(
      service.download(
        { url, outputDir: cancelledDir, formatId: format.id, hasVideo: true, hasAudio: true },
        controller.signal,
        (update) => {
          if (update.percent > 0) controller.abort();
        }
      ),
      { name: 'AbortError' }
    );
    assert.deepEqual(fs.readdirSync(cancelledDir), ['Export existant.mp4']);
    assert.equal(fs.readFileSync(existing, 'utf8'), 'preserve existing export');
    report.cancellation = {
      realFragmentTransfer: true,
      partialsAndMetadataCleaned: true,
      existingExportPreserved: true
    };
    report.passed = true;
    save();
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

localBenchmark().catch((error) => {
  report.passed = false;
  report.error = error.stack;
  fs.mkdirSync(directory, { recursive: true });
  save();
  console.error(error);
  process.exitCode = 1;
});
