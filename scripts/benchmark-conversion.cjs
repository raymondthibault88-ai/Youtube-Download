const assert = require('node:assert/strict');
const nodeCrypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MediaService } = require('../electron/services/media.cjs');
const { runProcess } = require('../electron/services/process-runner.cjs');

const ffmpeg = require('ffmpeg-static');
const baselineFfmpeg = process.env.V5_BASELINE_FFMPEG_PATH
  ? path.resolve(process.env.V5_BASELINE_FFMPEG_PATH)
  : ffmpeg;
const directory = path.resolve(process.env.V5_BENCHMARK_DIR || 'test-results/conversion');
const duration = Number(process.env.V5_BENCHMARK_SECONDS || 30);
const repetitions = Number(process.env.V5_BENCHMARK_REPETITIONS || 3);
const fixtures = path.join(directory, 'sources');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const hash = (file) => nodeCrypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const run = (args, options = {}) =>
  runProcess(ffmpeg, ['-hide_banner', ...args], {
    signal: AbortSignal.timeout(600_000),
    ...options
  });

function qualityCacheKey({
  outputSha256,
  sourceSha256,
  ffmpegSha256,
  model,
  targetHeight = null,
  expectedFrames
}) {
  for (const value of [outputSha256, sourceSha256, ffmpegSha256])
    assert.match(value, /^[a-f0-9]{64}$/i, 'Empreinte SHA256 de provenance invalide.');
  assert.ok(typeof model === 'string' && model.length > 0);
  assert.ok(targetHeight === null || (Number.isInteger(targetHeight) && targetHeight > 0));
  assert.ok(Number.isSafeInteger(expectedFrames) && expectedFrames > 0);
  return JSON.stringify({
    protocol: 1,
    outputSha256: outputSha256.toLowerCase(),
    sourceSha256: sourceSha256.toLowerCase(),
    ffmpegSha256: ffmpegSha256.toLowerCase(),
    model,
    targetHeight,
    expectedFrames
  });
}

function frameProofOutputLimit(expectedFrames) {
  assert.ok(Number.isSafeInteger(expectedFrames) && expectedFrames > 0);
  const limit = Math.max(1024 * 1024, expectedFrames * 160 + 65536);
  assert.ok(limit <= 64 * 1024 * 1024, 'Utiliser un extrait plus court pour la preuve des images.');
  return limit;
}

function engineHashes(entryPath) {
  const serviceDirectory = path.dirname(entryPath);
  const files = { 'media.cjs': hash(entryPath) };
  const visit = (relativeDirectory) => {
    const absoluteDirectory = path.join(serviceDirectory, relativeDirectory);
    for (const entry of fs
      .readdirSync(absoluteDirectory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) visit(relativePath);
      else if (entry.isFile() && entry.name.endsWith('.cjs')) {
        files[relativePath.split(path.sep).join('/')] = hash(
          path.join(serviceDirectory, relativePath)
        );
      }
    }
  };
  if (fs.existsSync(path.join(serviceDirectory, 'media'))) visit('media');
  for (const filename of ['process-runner.cjs', 'output-files.cjs']) {
    const absolutePath = path.join(serviceDirectory, filename);
    if (fs.existsSync(absolutePath)) files[filename] = hash(absolutePath);
  }
  files['shared/conversion-config.json'] = hash(
    path.resolve(serviceDirectory, '../../shared/conversion-config.json')
  );
  return files;
}

function selectedScenarios() {
  const scenarios = [
    ['1080p-fast', 'Mouvement 1080p é.mp4', null, 'fast', repetitions],
    ['4K-fast', 'Mouvement 4K é.mp4', null, 'fast', repetitions],
    ['4K-to-1080p-fast', 'Mouvement 4K é.mp4', 1080, 'fast', repetitions],
    ['1080p-balanced', 'Mouvement 1080p é.mp4', null, 'balanced', 1],
    ['4K-balanced', 'Mouvement 4K é.mp4', null, 'balanced', 1],
    ['1080p-compact', 'Mouvement 1080p é.mp4', null, 'compact', 1],
    ['4K-compact', 'Mouvement 4K é.mp4', null, 'compact', 1],
    ['4K-hevc-fast', 'Mouvement 4K HEVC é.mp4', null, 'fast', 1],
    ['4K-hevc-to-1080p-fast', 'Mouvement 4K HEVC é.mp4', 1080, 'fast', 1],
    ['1080p-vp9-fast', 'Mouvement 1080p VP9 é.mp4', null, 'fast', repetitions],
    ['4K-vp9-fast', 'Mouvement 4K VP9 é.mp4', null, 'fast', repetitions],
    ['4K-vp9-to-1080p-fast', 'Mouvement 4K VP9 é.mp4', 1080, 'fast', repetitions],
    ['1080p-av1-fast', 'Mouvement 1080p AV1 é.mp4', null, 'fast', repetitions],
    ['4K-av1-fast', 'Mouvement 4K AV1 é.mp4', null, 'fast', repetitions],
    ['4K-av1-to-1080p-fast', 'Mouvement 4K AV1 é.mp4', 1080, 'fast', repetitions]
  ];
  if (process.env.V5_BENCHMARK_REAL_AV1_SOURCE)
    scenarios.push([
      '4K-av1-real-fast',
      path.resolve(process.env.V5_BENCHMARK_REAL_AV1_SOURCE),
      null,
      'fast',
      repetitions
    ]);
  if (!process.env.V5_BENCHMARK_CASES) return scenarios;
  const selected = process.env.V5_BENCHMARK_CASES.split(',');
  assert.ok(
    selected.length > 0 && selected.every((id) => scenarios.some((entry) => entry[0] === id)),
    'Cas de benchmark inconnu.'
  );
  return scenarios.filter((entry) => selected.includes(entry[0]));
}

async function prepare(scenarios) {
  assert.ok(Number.isFinite(duration) && duration >= 3 && duration <= 300);
  fs.mkdirSync(fixtures, { recursive: true });
  const sources = new Set(scenarios.map((entry) => entry[1]));
  for (const [label, dimensions] of [
    ['1080p', '1920x1080'],
    ['4K', '3840x2160']
  ]) {
    if (![...sources].some((name) => name.startsWith(`Mouvement ${label} `))) continue;
    const file = path.join(fixtures, `Mouvement ${label} é.mp4`);
    if (fs.existsSync(file)) continue;
    console.log(`Préparation ${label} : ${duration}s, 30 images/s, mouvement et son.`);
    await run([
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=${dimensions}:rate=30`,
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000',
      '-t',
      String(duration),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '15',
      '-threads',
      '8',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      file
    ]);
  }
  const hevc = path.join(fixtures, 'Mouvement 4K HEVC é.mp4');
  if (sources.has(path.basename(hevc)) && !fs.existsSync(hevc)) {
    console.log('Préparation HEVC 4K : 8s maximum.');
    await run([
      '-y',
      '-loglevel',
      'error',
      '-i',
      path.join(fixtures, 'Mouvement 4K é.mp4'),
      '-t',
      String(Math.min(8, duration)),
      '-c:v',
      'libx265',
      '-preset',
      'veryfast',
      '-crf',
      '17',
      '-x265-params',
      'pools=8:frame-threads=2',
      '-pix_fmt',
      'yuv420p',
      '-tag:v',
      'hvc1',
      '-c:a',
      'copy',
      hevc
    ]);
  }
  for (const label of ['1080p', '4K']) {
    for (const codec of ['VP9', 'AV1']) {
      const filename = `Mouvement ${label} ${codec} é.mp4`;
      const file = path.join(fixtures, filename);
      if (!sources.has(filename) || fs.existsSync(file)) continue;
      console.log(`Préparation ${label} ${codec} : ${duration}s, SDR 8 bits, 30 images/s.`);
      const encoder =
        codec === 'VP9'
          ? ['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '6', '-tag:v', 'vp09']
          : ['-c:v', 'libaom-av1', '-usage', 'realtime', '-cpu-used', '8', '-tiles', '2x2'];
      await run([
        '-y',
        '-loglevel',
        'error',
        '-i',
        path.join(fixtures, `Mouvement ${label} é.mp4`),
        '-t',
        String(duration),
        ...encoder,
        '-row-mt',
        '1',
        '-threads',
        '8',
        '-crf',
        '20',
        '-b:v',
        '0',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'copy',
        '-movflags',
        '+faststart',
        file
      ]);
    }
  }
}

async function quality(output, input, targetHeight, label, height, expectedFrames) {
  const jsonPath = path.join(directory, `${label}-quality.json`);
  const reference = targetHeight ? `scale=-2:${targetHeight},` : '';
  const model = height >= 2160 ? 'vmaf_4k_v0.6.1' : 'vmaf_v0.6.1';
  const filter =
    `[0:v]setpts=PTS-STARTPTS[dist];[1:v]${reference}setpts=PTS-STARTPTS[ref];` +
    `[dist][ref]libvmaf=model=version=${model}:feature=name=psnr:n_threads=8:log_fmt=json:log_path=${path.basename(jsonPath)}`;
  await run(
    [
      '-loglevel',
      'error',
      '-i',
      output,
      '-i',
      input,
      '-filter_complex',
      filter,
      '-an',
      '-f',
      'null',
      '-'
    ],
    { cwd: directory }
  );
  const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assert.equal(report.frames.length, expectedFrames, 'VMAF doit couvrir toutes les images.');
  const ssim = await run([
    '-loglevel',
    'info',
    '-i',
    output,
    '-i',
    input,
    '-filter_complex',
    `[0:v]setpts=PTS-STARTPTS[dist];[1:v]${reference}setpts=PTS-STARTPTS[ref];[dist][ref]ssim`,
    '-an',
    '-f',
    'null',
    '-'
  ]);
  const ssimScore = Number(ssim.stderr.match(/SSIM[^\n]*All:([\d.]+)/)?.[1]);
  assert.ok(Number.isFinite(ssimScore));
  return {
    model,
    frames: report.frames.length,
    ssim: ssimScore,
    ...Object.fromEntries(
      Object.entries(report.pooled_metrics).map(([key, value]) => [key, value.mean])
    )
  };
}

async function inputFrames(input, targetHeight, inputArgs, expectedFrames) {
  const accelerated = inputArgs.includes('-hwaccel');
  const filters = accelerated ? ['hwdownload', 'format=nv12'] : [];
  if (targetHeight) filters.push(`scale=-2:${targetHeight}`);
  filters.push('format=nv12');
  const { stdout } = await run(
    [
      '-loglevel',
      'error',
      ...inputArgs,
      '-loglevel',
      'error',
      '-i',
      input,
      '-map',
      '0:v:0',
      '-vf',
      filters.join(','),
      '-c:v',
      'rawvideo',
      '-threads',
      '1',
      '-pix_fmt',
      'nv12',
      '-f',
      'framemd5',
      '-'
    ],
    { outputLimit: frameProofOutputLimit(expectedFrames) }
  );
  return stdout.split(/\r?\n/).filter((line) => line && !line.startsWith('#'));
}

async function validate(output, source, targetHeight, expectedHeight) {
  let probeStderr = '';
  const media = new MediaService(ffmpeg, {
    processRunner: async (command, args, options) => {
      const result = await runProcess(command, args, options);
      probeStderr = result.stderr;
      return result;
    }
  });
  const info = await media.inspect(output, AbortSignal.timeout(600_000));
  const videoLine =
    probeStderr
      .split(/\r?\n/)
      .find((line) => /^[ \t]*Stream #0:\d+(?:\[[^\]]*\]|\([^)]*\))*:\s*Video:/.test(line)) || '';
  const pixelProperties = videoLine.match(/,\s*yuv\w+(?:\(([^)]*)\))?/)?.[1] || '';
  const videoMetadata = {
    colorTags: pixelProperties
      .split(',')
      .map((value) => value.trim())
      .filter(
        (value) =>
          value &&
          !/progressive|interlaced|top first|bottom first|top coded first|bottom coded first/i.test(
            value
          )
      ),
    sampleAspectRatio: videoLine.match(/\bSAR\s+([\d:]+)/)?.[1] || null,
    frameRate: Number(videoLine.match(/\b([\d.]+)\s+fps\b/)?.[1]) || null,
    interlaced: info.interlaced
  };
  assert.equal(info.height, expectedHeight);
  assert.equal(info.codec, 'h264');
  assert.equal(info.pixelFormat, 'yuv420p');
  assert.ok(Math.abs(info.duration - source.duration) < 0.1);
  const { stdout } = await run([
    '-loglevel',
    'error',
    '-xerror',
    '-i',
    output,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-progress',
    'pipe:1',
    '-nostats',
    '-f',
    'null',
    '-'
  ]);
  const frames = Number([...stdout.matchAll(/^frame=(\d+)/gm)].at(-1)?.[1]);
  assert.equal(frames, source.frames);
  const audio = await run([
    '-loglevel',
    'error',
    '-i',
    output,
    '-map',
    '0:a:0',
    '-c:a',
    'pcm_s16le',
    '-f',
    'md5',
    '-'
  ]);
  assert.match(audio.stdout, /MD5=/);
  const video = await run([
    '-loglevel',
    'error',
    '-i',
    output,
    '-map',
    '0:v:0',
    '-pix_fmt',
    'yuv420p',
    '-f',
    'md5',
    '-'
  ]);
  assert.match(video.stdout, /MD5=/);
  return {
    height: info.height,
    duration: info.duration,
    frames,
    bytes: fs.statSync(output).size,
    audioMd5: audio.stdout.trim(),
    videoMd5: video.stdout.trim(),
    videoMetadata,
    targetHeight
  };
}

async function referenceFrameCount(inputPath) {
  const { stdout } = await run([
    '-loglevel',
    'error',
    '-xerror',
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-an',
    '-progress',
    'pipe:1',
    '-nostats',
    '-f',
    'null',
    '-'
  ]);
  const frames = Number([...stdout.matchAll(/^frame=(\d+)/gm)].at(-1)?.[1]);
  assert.ok(Number.isSafeInteger(frames) && frames > 0, 'Nombre d’images source invalide.');
  return frames;
}

async function compare(scenarios) {
  assert.ok(Number.isInteger(repetitions) && repetitions >= 1 && repetitions <= 9);
  assert.ok(
    process.env.V5_BENCHMARK_BASELINE,
    'V5_BENCHMARK_BASELINE doit désigner le moteur conservé avant modification.'
  );
  const baselinePath = path.resolve(process.env.V5_BENCHMARK_BASELINE);
  const optimizedPath = path.resolve(__dirname, '../electron/services/media.cjs');
  assert.ok(fs.statSync(baselineFfmpeg).isFile(), 'Le binaire FFmpeg de référence est absent.');
  const baselineModule = require(baselinePath);
  let commands = [];
  const runner = (command, args, options) => {
    commands.push(args);
    return runProcess(command, args, options);
  };
  const services = {
    baseline: new baselineModule.MediaService(baselineFfmpeg, { processRunner: runner }),
    optimized: new MediaService(ffmpeg, { processRunner: runner })
  };
  const probe = {};
  for (const [name, service] of Object.entries(services)) {
    const start = performance.now();
    probe[name] = {
      encoder: await service.detectHardwareEncoder(AbortSignal.timeout(20_000)),
      milliseconds: performance.now() - start
    };
  }
  const ffmpegBinaries = {};
  for (const [name, executable] of Object.entries({
    baseline: baselineFfmpeg,
    optimized: ffmpeg
  })) {
    const { stdout } = await runProcess(executable, ['-hide_banner', '-version'], {
      signal: AbortSignal.timeout(20_000)
    });
    ffmpegBinaries[name] = {
      path: executable,
      version: stdout.split(/\r?\n/, 1)[0],
      sha256: hash(executable)
    };
  }
  const report = {
    createdAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    ffmpeg: ffmpegBinaries.optimized.version,
    ffmpegBinaries,
    ffmpegBinariesIdentical: ffmpegBinaries.baseline.sha256 === ffmpegBinaries.optimized.sha256,
    engineFiles: {
      baseline: engineHashes(baselinePath),
      optimized: engineHashes(optimizedPath)
    },
    baselineSha256: hash(baselinePath),
    optimizedSha256: hash(optimizedPath),
    benchmarkScriptSha256: hash(__filename),
    conversionConfigSha256: hash(path.resolve(__dirname, '../shared/conversion-config.json')),
    methodology:
      'Sources synthétiques animées H.264, HEVC, VP9 et AV1 SDR 8 bits à 30 i/s, son AAC ; 1080p et 4K. Source AV1 réelle facultative, sans réencodage préalable ni cadence imposée. Nombre exact d’images source obtenu par décodage hors chronomètre. Temps mural, disque et faststart inclus, détection initiale séparée. Ordre avant/après alterné. Chaque sortie est entièrement décodée et chaque paire avant/après est contrôlée. Les métriques peuvent être réutilisées uniquement pour des fichiers entiers identiques par SHA256, avec source, binaire de mesure et paramètres identiques. Binaires FFmpeg et modules des deux moteurs identifiés par empreintes. Qualité sur toutes les images, VMAF 4K pour les sorties 4K. Ne prédit pas les performances sur tous les médias réels.',
    requestedFixtureSeconds: duration,
    probe,
    cases: []
  };
  assert.ok(scenarios.length > 0);
  const save = () =>
    fs.writeFileSync(
      path.join(directory, 'conversion-benchmark.json'),
      JSON.stringify(report, null, 2)
    );
  const qualityCache = new Map();
  for (const [id, filename, targetHeight, profileId, rounds] of scenarios) {
    console.log(`Comparaison ${id} (${rounds} passage(s) par moteur).`);
    const inputPath = path.resolve(fixtures, filename);
    const originalHash = hash(inputPath);
    const mediaInfo = {
      ...(await services.optimized.inspect(inputPath)),
      frames: await referenceFrameCount(inputPath)
    };
    frameProofOutputLimit(mediaInfo.frames);
    const expectedHeight = targetHeight || mediaInfo.height;
    const result = {
      id,
      source: { filename, ...mediaInfo, sha256: originalHash },
      targetHeight,
      profileId,
      timings: { baseline: [], optimized: [] },
      trials: [],
      outputs: {}
    };
    report.cases.push(result);
    for (let round = 0; round < rounds; round++) {
      for (const name of round % 2 ? ['optimized', 'baseline'] : ['baseline', 'optimized']) {
        commands = [];
        const progress = [];
        const outputDir = path.join(directory, 'outputs', runId, id, name, String(round + 1));
        const start = performance.now();
        const output = await services[name].convert({
          inputPath,
          outputDir,
          targetHeight,
          profileId,
          mediaInfo,
          signal: AbortSignal.timeout(600_000),
          onProgress: (value) => progress.push(value.percent)
        });
        const seconds = (performance.now() - start) / 1000;
        assert.ok(progress.every((value, index) => !index || value >= progress[index - 1]));
        assert.equal(path.basename(output), path.parse(filename).name + '.mp4');
        assert.equal(
          commands.filter((args) => args.includes('-progress')).length,
          1,
          'Un repli ne doit pas masquer un échec du parcours mesuré.'
        );
        result.timings[name].push(seconds);
        const trial = {
          engine: name,
          round: round + 1,
          path: output,
          commands,
          seconds,
          progressMonotonic: true
        };
        result.trials.push(trial);
        result.outputs[name] = trial;
        console.log(`${id} ${name} ${round + 1}/${rounds} : ${seconds.toFixed(3)}s`);
        save();
      }
    }
    result.medianSeconds = Object.fromEntries(
      Object.entries(result.timings).map(([name, values]) => [name, median(values)])
    );
    result.speedup = result.medianSeconds.baseline / result.medianSeconds.optimized;
    result.timeSavedPercent =
      100 * (1 - result.medianSeconds.optimized / result.medianSeconds.baseline);
    for (const output of result.trials) {
      output.validation = await validate(output.path, mediaInfo, targetHeight, expectedHeight);
      output.sha256 = hash(output.path);
    }
    const audioReference = result.trials[0].validation.audioMd5;
    assert.ok(
      result.trials.every((trial) => trial.validation.audioMd5 === audioReference),
      'L’audio décodé doit être identique pour tous les passages.'
    );
    result.qualityComparisons = [];
    const conversionCommand = (trial) => trial.commands.find((args) => args.includes('-progress'));
    const outputSettings = (command) => {
      const settings = command.slice(command.indexOf('-i') + 2, -1);
      // QSV receives GPU surfaces instead of CPU pixels; the encoded output
      // must retain all the other codec, bitrate, filter and audio settings.
      const format = settings.indexOf('-pix_fmt');
      if (format >= 0 && ['qsv', 'yuv420p'].includes(settings[format + 1]))
        settings[format + 1] = 'same-8bit-420-content';
      return settings;
    };
    for (let round = 1; round <= rounds; round++) {
      const pair = Object.fromEntries(
        result.trials.filter((trial) => trial.round === round).map((trial) => [trial.engine, trial])
      );
      assert.deepEqual(
        outputSettings(conversionCommand(pair.optimized)),
        outputSettings(conversionCommand(pair.baseline)),
        `${id} : les réglages de sortie doivent rester identiques.`
      );
      assert.deepEqual(
        pair.optimized.validation.videoMetadata,
        pair.baseline.validation.videoMetadata,
        `${id} : les couleurs, l’aspect et la cadence doivent rester identiques.`
      );
      const comparison = {
        round,
        decodedVideoIdentical:
          pair.baseline.validation.videoMd5 === pair.optimized.validation.videoMd5
      };
      if (comparison.decodedVideoIdentical) {
        // Identical decoded pixels imply identical quality against any reference.
        comparison.qualityMethod = 'identical-decoded-pixels';
        comparison.vmafDelta = 0;
        comparison.ssimDelta = 0;
      } else {
        comparison.qualityMethod = 'full-frame-metrics';
        for (const [name, output] of Object.entries(pair)) {
          const cacheKey = qualityCacheKey({
            outputSha256: output.sha256,
            sourceSha256: originalHash,
            ffmpegSha256: ffmpegBinaries.optimized.sha256,
            model: expectedHeight >= 2160 ? 'vmaf_4k_v0.6.1' : 'vmaf_v0.6.1',
            targetHeight,
            expectedFrames: mediaInfo.frames
          });
          const cached = qualityCache.get(cacheKey);
          if (cached) {
            output.quality = { ...cached.quality };
            output.qualityProvenance = {
              mode: 'identical-entire-file-sha256',
              cacheKey,
              reference: cached.reference
            };
          } else {
            output.quality = await quality(
              output.path,
              inputPath,
              targetHeight,
              `${id}-${name}-${round}`,
              expectedHeight,
              mediaInfo.frames
            );
            output.qualityProvenance = { mode: 'computed-full-frame-metrics', cacheKey };
            qualityCache.set(cacheKey, {
              quality: { ...output.quality },
              reference: { case: id, engine: name, round, path: output.path }
            });
          }
        }
        comparison.vmafDelta = pair.optimized.quality.vmaf - pair.baseline.quality.vmaf;
        comparison.ssimDelta = pair.optimized.quality.ssim - pair.baseline.quality.ssim;
      }
      comparison.passed = comparison.vmafDelta >= -0.05 && comparison.ssimDelta >= -0.0001;
      result.qualityComparisons.push(comparison);
      save();
    }
    // Allow only negligible rate-control variation, never a perceptible quality tradeoff.
    result.vmafDelta = Math.min(...result.qualityComparisons.map((pair) => pair.vmafDelta));
    result.ssimDelta = Math.min(...result.qualityComparisons.map((pair) => pair.ssimDelta));
    result.decodedVideoIdentical = result.qualityComparisons.every(
      (pair) => pair.decodedVideoIdentical
    );
    result.qualityMethod = result.decodedVideoIdentical
      ? 'identical-decoded-pixels'
      : 'full-frame-metrics';
    result.qualityPassed = result.qualityComparisons.every((pair) => pair.passed);
    result.outputSettingsUnchanged = true;
    result.videoMetadataUnchanged = true;
    save();
    assert.ok(
      result.qualityPassed,
      `${id} : qualité dégradée (VMAF ${result.vmafDelta}, SSIM ${result.ssimDelta}).`
    );
    if (result.outputs.optimized.commands.some((args) => args.includes('-hwaccel'))) {
      const inputArgs = (trial) => {
        const command = conversionCommand(trial);
        return command.slice(0, command.indexOf('-i'));
      };
      const baselineInputArgs = inputArgs(result.outputs.baseline);
      // H.264/HEVC were already accelerated in the reference. For the frame
      // proof only, use software decoding as its reference in those cases.
      const cpuInputArgs = baselineInputArgs.includes('-hwaccel') ? [] : baselineInputArgs;
      const gpuInputArgs = inputArgs(result.outputs.optimized);
      const cpu = await inputFrames(inputPath, targetHeight, cpuInputArgs, mediaInfo.frames);
      const gpu = await inputFrames(inputPath, targetHeight, gpuInputArgs, mediaInfo.frames);
      assert.deepEqual(
        gpu,
        cpu,
        `${id} : les images avant encodage doivent être strictement identiques.`
      );
      assert.equal(cpu.length, result.outputs.baseline.validation.frames);
      result.encoderInputFrameProof = {
        cpuInputArgs,
        gpuInputArgs,
        frameCount: cpu.length,
        rawvideoThreads: 1,
        decoderArgumentsMatchMeasuredCommand: true,
        pixelFormat: 'nv12'
      };
      result.encoderInputFramesIdentical = true;
    }
    assert.equal(hash(inputPath), originalHash);
    result.originalPreserved = true;
    result.audioIdentical = true;
    save();
    console.log(
      `${id} : ${result.speedup.toFixed(2)}×, VMAF ${result.vmafDelta.toFixed(4)}, SSIM ${result.ssimDelta.toFixed(7)}.`
    );
  }
  report.passed = report.cases.every((entry) => entry.qualityPassed && entry.originalPreserved);
  save();
  console.log(`Rapport : ${path.join(directory, 'conversion-benchmark.json')}`);
}

async function main() {
  const scenarios = selectedScenarios();
  await prepare(scenarios);
  if (process.argv[2] !== 'prepare') await compare(scenarios);
}

if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

module.exports = { qualityCacheKey, frameProofOutputLimit };
