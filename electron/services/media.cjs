const fs = require('node:fs');
const path = require('node:path');
const conversionConfig = require('../../shared/conversion-config.json');
const { appendTail, runProcess } = require('./process-runner.cjs');

const HARDWARE_ENCODERS = {
  darwin: ['h264_videotoolbox'],
  win32: ['h264_nvenc', 'h264_qsv', 'h264_amf'],
  linux: ['h264_nvenc', 'h264_qsv']
};

function parseFfmpegTime(value) {
  const match = String(value || '').match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  return (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]);
}

function getSpeedProfile(profileId) {
  return conversionConfig.speedProfiles.find((profile) => profile.id === profileId)
    || conversionConfig.speedProfiles[0];
}

function getTargetVideoBitrate(height, sourceBitrate, profileId = 'fast') {
  const resolutionProfile = conversionConfig.profiles.find((entry) => height >= entry.minHeight)
    || conversionConfig.profiles.at(-1);
  const speedProfile = getSpeedProfile(profileId);
  const sourceAdjusted = sourceBitrate > 0
    ? Math.max(conversionConfig.minimumVideoBitrate, Math.round(sourceBitrate * conversionConfig.sourceBitrateFactor))
    : resolutionProfile.videoBitrate;
  return Math.max(
    conversionConfig.minimumVideoBitrate,
    Math.round(Math.min(resolutionProfile.videoBitrate, sourceAdjusted) * speedProfile.bitrateFactor)
  );
}

function estimateOutputSize(mediaInfo, targetHeight, profileId = 'fast') {
  if (!mediaInfo.duration) return null;
  const effectiveHeight = targetHeight
    ? Math.min(targetHeight, mediaInfo.height || targetHeight)
    : mediaInfo.height || 1080;
  const bitrate = getTargetVideoBitrate(effectiveHeight, mediaInfo.bitrate, profileId);
  return Math.round(((bitrate + conversionConfig.audioBitrate) * mediaInfo.duration) / 8);
}

function buildOutputOptions(mediaInfo) {
  const heights = conversionConfig.resolutions.filter((height) => height < mediaInfo.height);
  const options = [{ height: null, label: `Original · ${mediaInfo.height || '?'}p` }, ...heights.map((height) => ({ height, label: `${height}p` }))];
  return options.map((option) => ({
    ...option,
    estimates: Object.fromEntries(conversionConfig.speedProfiles.map((profile) => [
      profile.id,
      estimateOutputSize(mediaInfo, option.height, profile.id)
    ]))
  }));
}

async function inspectVideoFile(ffmpegPath, inputPath, signal, processRunner = runProcess) {
  const { stderr } = await processRunner(ffmpegPath, ['-hide_banner', '-i', inputPath], {
    signal,
    acceptedExitCodes: [0, 1],
    outputLimit: 512 * 1024
  });
  const duration = parseFfmpegTime(stderr.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/)?.[1]) || 0;
  const videoLine = stderr.split('\n').find((line) => /Video:/.test(line)) || '';
  const audioLine = stderr.split('\n').find((line) => /Audio:/.test(line)) || '';
  const dimensions = videoLine.match(/(?:^|\s)(\d{2,5})x(\d{2,5})(?:[\s,]|$)/);
  const videoBitrate = Number(videoLine.match(/(\d+)\s*kb\/s/)?.[1] || 0) * 1000;
  const totalBitrate = Number(stderr.match(/Duration:[^\n]*bitrate:\s*(\d+)\s*kb\/s/)?.[1] || 0) * 1000;
  const rotation = Number(stderr.match(/displaymatrix:\s*rotation of\s*(-?[\d.]+)/)?.[1]
    || stderr.match(/\brotate\s*:\s*(-?[\d.]+)/)?.[1] || 0);
  if (!duration || !dimensions) throw new Error('Impossible de lire les informations de cette vidéo.');
  return {
    duration,
    width: Number(dimensions[1]),
    height: Number(dimensions[2]),
    bitrate: videoBitrate || totalBitrate,
    codec: videoLine.match(/Video:\s*(\w+)/)?.[1] || null,
    hasAudio: Boolean(audioLine),
    audioCodec: audioLine.match(/Audio:\s*(\w+)/)?.[1] || null,
    pixelFormat: videoLine.match(/,\s*(yuv\w+|nv12|p010le)\b/)?.[1] || null,
    highDynamicRange: /bt2020|smpte2084|arib-std-b67/i.test(videoLine),
    interlaced: /interlaced|top first|bottom first|top coded first|bottom coded first/i.test(videoLine),
    rotation
  };
}

function conversionPipeline(encoder, mediaInfo, targetHeight, forceSoftwareDecode) {
  const resize = targetHeight && mediaInfo.height > targetHeight;
  const scale = resize ? [`scale=-2:${targetHeight}`] : [];
  // Restrict the new decoder path to SDR 8-bit 4:2:0 streams. Keep FFmpeg's
  // existing handling of HDR, chroma conversion, interlacing and autorotation.
  const accelerated = encoder === 'h264_qsv' && !forceSoftwareDecode
    && ['h264', 'hevc'].includes(mediaInfo.codec)
    && mediaInfo.pixelFormat === 'yuv420p'
    && !mediaInfo.highDynamicRange && !mediaInfo.interlaced && !mediaInfo.rotation && !resize;
  if (!accelerated) return { input: [], filters: scale, pixelFormat: 'yuv420p', accelerated: false };
  return {
    input: ['-hwaccel', 'qsv', '-hwaccel_output_format', 'qsv', '-extra_hw_frames', '32'],
    // Native-size transcoding avoids GPU readback. Resizing keeps the original
    // decoder/scaler: GPU scaling changes the image; readback was slower.
    filters: [],
    pixelFormat: 'qsv',
    accelerated: true
  };
}

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
      const { stdout } = await this.runProcess(this.ffmpegPath, ['-hide_banner', '-encoders'], { signal });
      for (const encoder of candidates) {
        if (!stdout.includes(encoder)) continue;
        try {
          await this.runProcess(this.ffmpegPath, [
            '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=size=320x180:rate=30',
            '-t', '0.15', '-an', '-c:v', encoder, '-f', 'null', '-'
          ], { signal, outputLimit: 64 * 1024 });
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
      return ['-c:v', 'libx264', '-preset', softwarePreset, '-b:v', String(bitrate), '-maxrate', String(Math.round(bitrate * 1.35)), '-bufsize', String(bitrate * 2), '-pix_fmt', 'yuv420p'];
    }
    const common = ['-c:v', encoder, '-b:v', String(bitrate), '-maxrate', String(Math.round(bitrate * 1.35)), '-pix_fmt', pixelFormat];
    if (encoder === 'h264_videotoolbox') return [...common, '-allow_sw', '1'];
    if (encoder === 'h264_nvenc') return [...common, '-preset', 'p2', '-tune', 'hq'];
    if (encoder === 'h264_amf') return [...common, '-quality', 'speed'];
    return [...common, '-preset', 'veryfast'];
  }

  async convert({ inputPath, outputDir, targetHeight, profileId = 'fast', mediaInfo, signal, onProgress, outputPath, progressRange = [0, 100], forceSoftware = false, forceSoftwareDecode = false, progressFloor = 0 }) {
    const speedProfile = getSpeedProfile(profileId);
    const destination = outputPath || getAvailableOutputPath(inputPath, outputDir);
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    const temporaryPath = path.join(path.dirname(destination), `.${path.basename(destination, '.mp4')}.${process.pid}.${Date.now()}.tmp.mp4`);
    const effectiveHeight = targetHeight ? Math.min(targetHeight, mediaInfo.height) : mediaInfo.height;
    const bitrate = getTargetVideoBitrate(effectiveHeight, mediaInfo.bitrate, profileId);
    const encoder = speedProfile.preferHardware && !forceSoftware ? await this.detectHardwareEncoder(signal).catch((error) => {
      if (signal?.aborted || error?.name === 'AbortError') throw error;
      return null;
    }) : null;
    const pipeline = conversionPipeline(encoder, mediaInfo, targetHeight, forceSoftwareDecode);
    const scaleArgs = pipeline.filters.length ? ['-vf', pipeline.filters.join(',')] : [];
    const encoderArgs = this.encoderArgs(encoder, bitrate, speedProfile.softwarePreset, pipeline.pixelFormat);
    const [rangeStart, rangeEnd] = progressRange;
    let stdoutBuffer = '';
    let progressValues = {};
    let stderr = '';
    let lastPercent = -1;
    let encoded = false;

    const emitProgress = () => {
      const elapsed = parseFfmpegTime(progressValues.out_time);
      const ratio = elapsed !== null && mediaInfo.duration > 0 ? Math.min(0.99, elapsed / mediaInfo.duration) : 0;
      const percent = Math.max(progressFloor, Math.round(rangeStart + (ratio * (rangeEnd - rangeStart))));
      if (percent === lastPercent) return;
      lastPercent = percent;
      const speed = progressValues.speed || null;
      const speedFactor = Number.parseFloat(speed) || 0;
      const remainingSeconds = speedFactor > 0 && elapsed !== null ? Math.max(0, (mediaInfo.duration - elapsed) / speedFactor) : null;
      onProgress?.({
        percent,
        speed,
        eta: remainingSeconds === null ? null : formatEta(remainingSeconds),
        stage: 'convert',
        raw: encoder ? 'Conversion de la vidéo…' : 'Préparation du MP4…'
      });
    };

    try {
      await this.runProcess(this.ffmpegPath, [
        '-y', '-hide_banner', '-loglevel', 'warning', ...pipeline.input, '-i', inputPath,
        '-map', '0:v:0', '-map', '0:a:0?', ...scaleArgs, ...encoderArgs,
        '-tag:v', 'avc1', '-c:a', 'aac', '-b:a', String(conversionConfig.audioBitrate),
        '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', temporaryPath
      ], {
        signal,
        outputLimit: 128 * 1024,
        onStderr: (chunk) => { stderr = appendTail(stderr, chunk, 128 * 1024); },
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
      });
      encoded = true;
      await fs.promises.rename(temporaryPath, destination);
      return destination;
    } catch (error) {
      await fs.promises.unlink(temporaryPath).catch(() => {});
      if (!encoded && encoder && !signal?.aborted && error?.name !== 'AbortError') {
        onProgress?.({ percent: Math.max(progressFloor, lastPercent, rangeStart), stage: 'convert', speed: null, eta: null, raw: 'Poursuite de la conversion…' });
        return this.convert({ inputPath, outputDir, targetHeight, profileId, mediaInfo, signal, onProgress, outputPath: destination, progressRange, forceSoftware: !pipeline.accelerated, forceSoftwareDecode: true, progressFloor: Math.max(progressFloor, lastPercent, rangeStart) });
      }
      if (stderr && !error.message) error.message = stderr.trim();
      throw error;
    }
  }

  async remux(inputPath, signal, onProgress) {
    const parsed = path.parse(inputPath);
    const destination = getAvailableOutputPath(inputPath, parsed.dir);
    const temporaryPath = path.join(parsed.dir, `.${parsed.name}.${process.pid}.${Date.now()}.faststart.mp4`);
    try {
      onProgress?.({ percent: 98, stage: 'finalize', speed: null, eta: null, raw: 'Finalisation du fichier MP4…' });
      await this.runProcess(this.ffmpegPath, [
        '-y', '-hide_banner', '-loglevel', 'warning', '-i', inputPath,
        '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart', temporaryPath
      ], { signal, outputLimit: 128 * 1024 });
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

module.exports = {
  MediaService,
  buildOutputOptions,
  estimateOutputSize,
  getAvailableOutputPath,
  getTargetVideoBitrate,
  inspectVideoFile,
  parseFfmpegTime
};
