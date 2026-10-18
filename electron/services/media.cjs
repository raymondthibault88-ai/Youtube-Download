const fs = require('node:fs');
const path = require('node:path');
const conversionConfig = require('../../shared/conversion-config.json');
const { appendTail, runProcess } = require('./process-runner.cjs');
const {
  getSpeedProfile,
  getTargetVideoBitrate,
  estimateOutputSize,
  buildOutputOptions
} = require('./media/profiles.cjs');
const { parseFfmpegTime, inspectVideoFile } = require('./media/probe.cjs');
const { HARDWARE_ENCODERS, conversionPipeline } = require('./media/encoding.cjs');
function getAvailableOutputPath(inputPath, outputDir) {
  const parsed = path.parse(inputPath);
  const destinationDir = outputDir || parsed.dir;
  const baseName = parsed.name;
  let candidate = path.join(destinationDir, `${baseName}.mp4`);
  let index = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(destinationDir, `${baseName} (${index}).mp4`);
    index += 1;
  }
  return candidate;
}

class MediaService {
  constructor(ffmpegPath, { processRunner = runProcess } = {}) {
    this.ffmpegPath = ffmpegPath;
    this.runProcess = processRunner;
    this.hardwareEncoderPromise = null;
  }

  inspect(inputPath, signal) {
    return inspectVideoFile(this.ffmpegPath, inputPath, signal, this.runProcess);
  }

  async detectHardwareEncoder(signal) {
    if (this.hardwareEncoderPromise) return this.hardwareEncoderPromise;
    this.hardwareEncoderPromise = (async () => {
      const candidates = HARDWARE_ENCODERS[process.platform] || [];
      if (!candidates.length) return null;
      const { stdout } = await this.runProcess(this.ffmpegPath, ['-hide_banner', '-encoders'], {
        signal
      });
      for (const encoder of candidates) {
        if (!stdout.includes(encoder)) continue;
        try {
          await this.runProcess(
            this.ffmpegPath,
            [
              '-hide_banner',
              '-loglevel',
              'error',
              '-f',
              'lavfi',
              '-i',
              'color=size=320x180:rate=30',
              '-t',
              '0.15',
              '-an',
              '-c:v',
              encoder,
              '-f',
              'null',
              '-'
            ],
            { signal, outputLimit: 64 * 1024 }
          );
          return encoder;
        } catch (error) {
          if (signal?.aborted || error?.name === 'AbortError') throw error;
          // Try the next encoder exposed by this FFmpeg build.
        }
      }
      return null;
    })().catch((error) => {
      this.hardwareEncoderPromise = null;
      throw error;
    });
    return this.hardwareEncoderPromise;
  }

  encoderArgs(encoder, bitrate, softwarePreset, pixelFormat = 'yuv420p') {
    if (!encoder) {
      return [
        '-c:v',
        'libx264',
        '-preset',
        softwarePreset,
        '-b:v',
        String(bitrate),
        '-maxrate',
        String(Math.round(bitrate * 1.35)),
        '-bufsize',
        String(bitrate * 2),
        '-pix_fmt',
        'yuv420p'
      ];
    }
    const common = [
      '-c:v',
      encoder,
      '-b:v',
      String(bitrate),
      '-maxrate',
      String(Math.round(bitrate * 1.35)),
      '-pix_fmt',
      pixelFormat
    ];
    if (encoder === 'h264_videotoolbox') return [...common, '-allow_sw', '1'];
    if (encoder === 'h264_nvenc') return [...common, '-preset', 'p2', '-tune', 'hq'];
    if (encoder === 'h264_amf') return [...common, '-quality', 'speed'];
    return [...common, '-preset', 'veryfast'];
  }

  async convert({
    inputPath,
    outputDir,
    targetHeight,
    profileId = 'fast',
    mediaInfo,
    signal,
    onProgress,
    outputPath,
    progressRange = [0, 100],
    forceSoftware = false,
    forceSoftwareDecode = false,
    progressFloor = 0
  }) {
    const speedProfile = getSpeedProfile(profileId);
    const destination = outputPath || getAvailableOutputPath(inputPath, outputDir);
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    const temporaryPath = path.join(
      path.dirname(destination),
      `.${path.basename(destination, '.mp4')}.${process.pid}.${Date.now()}.tmp.mp4`
    );
    const effectiveHeight = targetHeight
      ? Math.min(targetHeight, mediaInfo.height)
      : mediaInfo.height;
    const bitrate = getTargetVideoBitrate(effectiveHeight, mediaInfo.bitrate, profileId);
    const encoder =
      speedProfile.preferHardware && !forceSoftware
        ? await this.detectHardwareEncoder(signal).catch((error) => {
            if (signal?.aborted || error?.name === 'AbortError') throw error;
            return null;
          })
        : null;
    const pipeline = conversionPipeline(encoder, mediaInfo, targetHeight, forceSoftwareDecode);
    const scaleArgs = pipeline.filters.length ? ['-vf', pipeline.filters.join(',')] : [];
    const encoderArgs = this.encoderArgs(
      encoder,
      bitrate,
      speedProfile.softwarePreset,
      pipeline.pixelFormat
    );
    const [rangeStart, rangeEnd] = progressRange;
    let stdoutBuffer = '';
    let progressValues = {};
    let stderr = '';
    let lastPercent = -1;
    let encoded = false;

    const emitProgress = () => {
      const elapsed = parseFfmpegTime(progressValues.out_time);
      const ratio =
        elapsed !== null && mediaInfo.duration > 0
          ? Math.min(0.99, elapsed / mediaInfo.duration)
          : 0;
      const percent = Math.max(
        progressFloor,
        Math.round(rangeStart + ratio * (rangeEnd - rangeStart))
      );
      if (percent === lastPercent) return;
      lastPercent = percent;
      const speed = progressValues.speed || null;
      const speedFactor = Number.parseFloat(speed) || 0;
      const remainingSeconds =
        speedFactor > 0 && elapsed !== null
          ? Math.max(0, (mediaInfo.duration - elapsed) / speedFactor)
          : null;
      onProgress?.({
        percent,
        speed,
        eta: remainingSeconds === null ? null : formatEta(remainingSeconds),
        stage: 'convert',
        raw: encoder ? 'Conversion de la vidéo…' : 'Préparation du MP4…'
      });
    };

    try {
      await this.runProcess(
        this.ffmpegPath,
        [
          '-y',
          '-hide_banner',
          '-loglevel',
          'warning',
          ...pipeline.input,
          '-i',
          inputPath,
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          ...scaleArgs,
          ...encoderArgs,
          '-tag:v',
          'avc1',
          '-c:a',
          'aac',
          '-b:a',
          String(conversionConfig.audioBitrate),
          '-movflags',
          '+faststart',
          '-progress',
          'pipe:1',
          '-nostats',
          temporaryPath
        ],
        {
          signal,
          outputLimit: 128 * 1024,
          onStderr: (chunk) => {
            stderr = appendTail(stderr, chunk, 128 * 1024);
          },
          onStdout: (chunk) => {
            stdoutBuffer += chunk.toString();
            const lines = stdoutBuffer.split('\n');
            stdoutBuffer = lines.pop() || '';
            for (const line of lines) {
              const separator = line.indexOf('=');
              if (separator < 0) continue;
              const key = line.slice(0, separator);
              progressValues[key] = line.slice(separator + 1);
              if (key === 'progress') {
                emitProgress();
                progressValues = {};
              }
            }
          }
        }
      );
      encoded = true;
      await fs.promises.rename(temporaryPath, destination);
      return destination;
    } catch (error) {
      await fs.promises.unlink(temporaryPath).catch(() => {});
      if (!encoded && encoder && !signal?.aborted && error?.name !== 'AbortError') {
        onProgress?.({
          percent: Math.max(progressFloor, lastPercent, rangeStart),
          stage: 'convert',
          speed: null,
          eta: null,
          raw: 'Poursuite de la conversion…'
        });
        return this.convert({
          inputPath,
          outputDir,
          targetHeight,
          profileId,
          mediaInfo,
          signal,
          onProgress,
          outputPath: destination,
          progressRange,
          forceSoftware: !pipeline.accelerated,
          forceSoftwareDecode: true,
          progressFloor: Math.max(progressFloor, lastPercent, rangeStart)
        });
      }
      if (stderr && !error.message) error.message = stderr.trim();
      throw error;
    }
  }

  async remux(inputPath, signal, onProgress) {
    const parsed = path.parse(inputPath);
    const destination = getAvailableOutputPath(inputPath, parsed.dir);
    const temporaryPath = path.join(
      parsed.dir,
      `.${parsed.name}.${process.pid}.${Date.now()}.faststart.mp4`
    );
    try {
      onProgress?.({
        percent: 98,
        stage: 'finalize',
        speed: null,
        eta: null,
        raw: 'Finalisation du fichier MP4…'
      });
      await this.runProcess(
        this.ffmpegPath,
        [
          '-y',
          '-hide_banner',
          '-loglevel',
          'warning',
          '-i',
          inputPath,
          '-map',
          '0:v:0',
          '-map',
          '0:a:0?',
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          temporaryPath
        ],
        { signal, outputLimit: 128 * 1024 }
      );
      await fs.promises.rename(temporaryPath, destination);
      if (destination !== inputPath) await fs.promises.unlink(inputPath).catch(() => {});
      return destination;
    } catch (error) {
      await fs.promises.unlink(temporaryPath).catch(() => {});
      throw error;
    }
  }
}

function formatEta(seconds) {
  const rounded = Math.ceil(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return minutes > 0 ? `${minutes}:${String(remainder).padStart(2, '0')}` : `${remainder}s`;
}
// Keep the public entry point stable for the IPC layer and existing benchmarks.
module.exports = {
  MediaService,
  buildOutputOptions,
  estimateOutputSize,
  getAvailableOutputPath,
  getTargetVideoBitrate,
  inspectVideoFile,
  parseFfmpegTime
};
