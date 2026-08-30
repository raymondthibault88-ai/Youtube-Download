const downloadConfig = require('../../shared/download-config.json');
const { formatBytes } = require('../../shared/formatters.js');
const { runProcess } = require('./process-runner.cjs');

const FAST_EXTRACTOR_ARGS = 'youtube:player_client=web_embedded,web_safari';
const VIDEO_CODECS = ['avc1', 'h264'];
const AUDIO_CODECS = ['mp4a', 'aac'];

function normalizeCodec(value) {
  return String(value || '').trim().toLowerCase();
}

function hasPrefix(codec, prefixes) {
  const normalized = normalizeCodec(codec);
  return Boolean(normalized && prefixes.some((prefix) => normalized.startsWith(prefix)));
}

function toFormats(info) {
  const formats = Array.isArray(info.formats) ? info.formats : [];
  const hasCompatibleAudio = formats.some((format) => format.vcodec === 'none' && format.acodec !== 'none' && hasPrefix(format.acodec, AUDIO_CODECS));
  return formats.map((format) => {
    const hasVideo = Boolean(format.vcodec && format.vcodec !== 'none');
    const hasAudio = Boolean(format.acodec && format.acodec !== 'none');
    const videoCodec = hasVideo ? normalizeCodec(format.vcodec) : null;
    const audioCodec = hasAudio ? normalizeCodec(format.acodec) : null;
    return {
      id: String(format.format_id),
      resolution: format.resolution || (format.height ? `${format.height}p` : 'audio only'),
      height: Number(format.height || 0),
      ext: format.ext,
      fps: format.fps || null,
      hasVideo,
      hasAudio,
      videoCodec,
      audioCodec,
      quickTimeCompatible: hasVideo && hasPrefix(videoCodec, VIDEO_CODECS) && (hasAudio ? hasPrefix(audioCodec, AUDIO_CODECS) : hasCompatibleAudio),
      fileSizeText: formatBytes(format.filesize || format.filesize_approx)
    };
  }).filter((format) => format.hasVideo)
    .sort((a, b) => (b.height - a.height) || ((b.fps || 0) - (a.fps || 0)))
    .map((format) => {
      const output = { ...format };
      delete output.height;
      return output;
    });
}

function buildAnalyzeArgs(url, fast = true, runtimePath = process.execPath) {
  const args = ['--no-playlist', '--no-warnings', '--js-runtimes', `node:${runtimePath}`, '--skip-download'];
  if (fast) args.push('--extractor-args', FAST_EXTRACTOR_ARGS);
  args.push('-J', url);
  return args;
}

function buildFormatSelector(payload) {
  const requested = String(payload.formatId).trim();
  const needsAudio = payload.mergeAudioIfNeeded || (payload.hasVideo !== false && payload.hasAudio === false);
  return needsAudio ? `${requested}+bestaudio[ext=m4a]/${requested}+bestaudio/${requested}` : requested;
}

function buildDownloadArgs({ ffmpegPath, formatSelector, outputDir, url, shouldRecodeToMp4, runtimePath = process.execPath }) {
  const args = [
    '--newline', '--no-playlist', '--no-warnings', '--js-runtimes', `node:${runtimePath}`,
    '--ffmpeg-location', ffmpegPath, '--format-sort', 'vcodec:h264,acodec:aac', '-f', formatSelector
  ];
  if (downloadConfig.concurrentFragments > 1) args.push('-N', String(Math.floor(downloadConfig.concurrentFragments)));
  if (formatSelector.includes('+')) {
    args.push('--merge-output-format', shouldRecodeToMp4 ? 'mkv' : 'mp4');
    if (!shouldRecodeToMp4) args.push('--postprocessor-args', 'Merger+ffmpeg_o:-movflags +faststart');
  }
  args.push('--print', 'after_move:__YTDLP_FILE__:%(filepath)s', '-o', downloadConfig.outputTemplate, '-P', outputDir, url);
  return args;
}

function parseDownloadProgress(line) {
  const percent = Number(line.match(/(\d+(?:\.\d+)?)%/)?.[1]);
  return {
    percent: Number.isFinite(percent) ? percent : null,
    speed: line.match(/at\s+([^\s]+\/?s)/i)?.[1] || null,
    eta: line.match(/ETA\s+([^\s]+)/i)?.[1] || null,
    raw: line.trim()
  };
}

class YouTubeService {
  constructor({ ytDlpPath, ffmpegPath, mediaService }) {
    this.ytDlpPath = ytDlpPath;
    this.ffmpegPath = ffmpegPath;
    this.mediaService = mediaService;
    this.cache = new Map();
  }

  env() {
    return { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  }

  async analyze(url, signal) {
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data;
    let info;
    try {
      const result = await runProcess(this.ytDlpPath, buildAnalyzeArgs(url, true), { env: this.env(), signal, outputLimit: 16 * 1024 * 1024 });
      info = JSON.parse(result.stdout);
      if (!Array.isArray(info.formats) || !info.formats.length) throw new Error('Aucun format exploitable.');
    } catch (fastError) {
      if (fastError?.name === 'AbortError') throw fastError;
      const result = await runProcess(this.ytDlpPath, buildAnalyzeArgs(url, false), { env: this.env(), signal, outputLimit: 16 * 1024 * 1024 });
      info = JSON.parse(result.stdout);
    }
    const data = { id: info.id, title: info.title, thumbnail: info.thumbnail, duration: info.duration, uploader: info.uploader, formats: toFormats(info) };
    this.cache.set(url, { at: Date.now(), data });
    if (this.cache.size > 20) this.cache.delete(this.cache.keys().next().value);
    return data;
  }

  async download(payload, signal, onProgress) {
    const selector = buildFormatSelector(payload);
    const recode = payload.shouldRecodeToMp4 === true;
    const args = buildDownloadArgs({
      ffmpegPath: this.ffmpegPath,
      formatSelector: selector,
      outputDir: payload.outputDir,
      url: payload.url,
      shouldRecodeToMp4: recode
    });
    let buffer = '';
    let downloadedPath = null;
    await runProcess(this.ytDlpPath, args, {
      env: this.env(), signal, outputLimit: 128 * 1024,
      onStdout: (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('__YTDLP_FILE__:')) downloadedPath = line.slice('__YTDLP_FILE__:'.length).trim();
          if (!line.includes('[download]')) continue;
          const progress = parseDownloadProgress(line);
          if (progress.percent !== null) progress.percent = Math.round(progress.percent * (recode ? 0.82 : 0.97));
          onProgress(progress);
        }
      }
    });
    if (!downloadedPath) throw new Error('Le fichier téléchargé est introuvable.');

    let outputPath = downloadedPath;
    if (recode) {
      onProgress({ percent: 82, speed: null, eta: null, raw: 'Conversion H.264/AAC compatible Dartfish…' });
      const mediaInfo = await this.mediaService.inspect(downloadedPath, signal);
      outputPath = await this.mediaService.convert({
        inputPath: downloadedPath,
        outputDir: payload.outputDir,
        targetHeight: null,
        profileId: 'fast',
        mediaInfo,
        signal,
        onProgress,
        progressRange: [82, 99]
      });
      if (outputPath !== downloadedPath) await require('node:fs').promises.unlink(downloadedPath).catch(() => {});
    } else if (!selector.includes('+')) {
      outputPath = await this.mediaService.remux(downloadedPath, signal, onProgress);
    }
    return { ok: true, outputPath };
  }
}

module.exports = {
  YouTubeService,
  buildAnalyzeArgs,
  buildDownloadArgs,
  buildFormatSelector,
  parseDownloadProgress,
  toFormats
};
