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
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const run = (args, options = {}) =>
  runProcess(ffmpeg, ['-hide_banner', ...args], {
    signal: AbortSignal.timeout(600_000),
    ...options
  });

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
  files['shared/conversion-config.json'] = hash(
    path.resolve(serviceDirectory, '../../shared/conversion-config.json')
  );
  return files;
}

async function prepare() {
  assert.ok(Number.isFinite(duration) && duration >= 3 && duration <= 300);
  fs.mkdirSync(fixtures, { recursive: true });
  for (const [label, dimensions] of [
    ['1080p', '1920x1080'],
    ['4K', '3840x2160']
  ]) {
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
  if (!fs.existsSync(hevc)) {
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
}

async function quality(output, input, targetHeight, label, height) {
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
  assert.ok(report.frames.length > 0);
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

async function inputFrames(input, targetHeight, accelerated) {
  const filters = accelerated ? ['hwdownload', 'format=nv12'] : [];
  if (targetHeight) filters.push(`scale=-2:${targetHeight}`);
  filters.push('format=nv12');
  const { stdout } = await run([
    '-loglevel',
    'error',
    ...(accelerated
      ? ['-hwaccel', 'qsv', '-hwaccel_output_format', 'qsv', '-extra_hw_frames', '32']
      : []),
    '-i',
    input,
    '-map',
    '0:v:0',
    '-vf',
    filters.join(','),
    '-c:v',
    'rawvideo',
    '-pix_fmt',
    'nv12',
    '-f',
    'framemd5',
    '-'
  ]);
  return stdout.split(/\r?\n/).filter((line) => line && !line.startsWith('#'));
}

async function validate(output, source, targetHeight, expectedHeight) {
  const info = await new MediaService(ffmpeg).inspect(output);
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
  assert.equal(frames, Math.round(source.duration * 30));
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
    targetHeight
  };
}

async function compare() {
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
    conversionConfigSha256: hash(path.resolve(__dirname, '../shared/conversion-config.json')),
    methodology:
      'Sources synthétiques animées H.264 8 bits à 30 i/s, son AAC ; 1080p et 4K. HEVC supplémentaire. Temps mural, disque et faststart inclus, détection initiale séparée. Ordre avant/après alterné. Binaires FFmpeg et modules des deux moteurs identifiés par empreintes. Qualité sur toutes les images, VMAF 4K pour les sorties 4K. Ne prédit pas les performances sur tous les médias réels.',
    probe,
    cases: []
  };
  let scenarios = [
    ['1080p-fast', 'Mouvement 1080p é.mp4', null, 'fast', repetitions],
    ['4K-fast', 'Mouvement 4K é.mp4', null, 'fast', repetitions],
    ['4K-to-1080p-fast', 'Mouvement 4K é.mp4', 1080, 'fast', repetitions],
    ['1080p-balanced', 'Mouvement 1080p é.mp4', null, 'balanced', 1],
    ['4K-balanced', 'Mouvement 4K é.mp4', null, 'balanced', 1],
    ['1080p-compact', 'Mouvement 1080p é.mp4', null, 'compact', 1],
    ['4K-compact', 'Mouvement 4K é.mp4', null, 'compact', 1],
    ['4K-hevc-fast', 'Mouvement 4K HEVC é.mp4', null, 'fast', 1],
    ['4K-hevc-to-1080p-fast', 'Mouvement 4K HEVC é.mp4', 1080, 'fast', 1]
  ];
  if (process.env.V5_BENCHMARK_CASES) {
    const selected = process.env.V5_BENCHMARK_CASES.split(',');
    assert.ok(
      selected.every((id) => scenarios.some((entry) => entry[0] === id)),
      'Cas de benchmark inconnu.'
    );
    scenarios = scenarios.filter((entry) => selected.includes(entry[0]));
  }
  assert.ok(scenarios.length > 0);
  const save = () =>
    fs.writeFileSync(
      path.join(directory, 'conversion-benchmark.json'),
      JSON.stringify(report, null, 2)
    );
  for (const [id, filename, targetHeight, profileId, rounds] of scenarios) {
    console.log(`Comparaison ${id} (${rounds} passage(s) par moteur).`);
    const inputPath = path.join(fixtures, filename);
    const originalHash = hash(inputPath);
    const mediaInfo = await services.optimized.inspect(inputPath);
    const expectedHeight = targetHeight || mediaInfo.height;
    const result = {
      id,
      source: { filename, ...mediaInfo, sha256: originalHash },
      targetHeight,
      profileId,
      timings: { baseline: [], optimized: [] },
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
        assert.equal(path.basename(output), filename.replace(/\.mp4$/, '') + '.mp4');
        assert.equal(
          commands.filter((args) => args.includes('-progress')).length,
          1,
          'Un repli ne doit pas masquer un échec du parcours mesuré.'
        );
        result.timings[name].push(seconds);
        result.outputs[name] = { path: output, commands, progressMonotonic: true };
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
    for (const output of Object.values(result.outputs)) {
      output.validation = await validate(output.path, mediaInfo, targetHeight, expectedHeight);
    }
    assert.equal(
      result.outputs.baseline.validation.audioMd5,
      result.outputs.optimized.validation.audioMd5,
      'L’audio décodé doit être identique.'
    );
    result.decodedVideoIdentical =
      result.outputs.baseline.validation.videoMd5 === result.outputs.optimized.validation.videoMd5;
    if (result.decodedVideoIdentical) {
      // Identical decoded pixels imply identical quality against any reference.
      result.qualityMethod = 'identical-decoded-pixels';
      result.vmafDelta = 0;
      result.ssimDelta = 0;
    } else {
      result.qualityMethod = 'full-frame-metrics';
      for (const [name, output] of Object.entries(result.outputs)) {
        output.quality = await quality(
          output.path,
          inputPath,
          targetHeight,
          `${id}-${name}`,
          expectedHeight
        );
      }
      result.vmafDelta =
        result.outputs.optimized.quality.vmaf - result.outputs.baseline.quality.vmaf;
      result.ssimDelta =
        result.outputs.optimized.quality.ssim - result.outputs.baseline.quality.ssim;
    }
    // Allow only negligible rate-control variation, never a perceptible quality tradeoff.
    result.qualityPassed = result.vmafDelta >= -0.05 && result.ssimDelta >= -0.0001;
    assert.ok(
      result.qualityPassed,
      `${id} : qualité dégradée (VMAF ${result.vmafDelta}, SSIM ${result.ssimDelta}).`
    );
    if (result.outputs.optimized.commands.some((args) => args.includes('-hwaccel'))) {
      const cpu = await inputFrames(inputPath, targetHeight, false);
      const gpu = await inputFrames(inputPath, targetHeight, true);
      assert.deepEqual(
        gpu,
        cpu,
        `${id} : les images avant encodage doivent être strictement identiques.`
      );
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
  await prepare();
  if (process.argv[2] !== 'prepare') await compare();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
