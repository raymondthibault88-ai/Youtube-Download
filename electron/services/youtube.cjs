const fs = require('node:fs');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');
const downloadConfig = require('../../shared/download-config.json');
const { formatBytes } = require('../../shared/formatters.js');
const { runProcess, createAbortError } = require('./process-runner.cjs');
const { getAvailableOutputPath } = require('./media.cjs');
const { stripVTControlCharacters } = require('node:util');

const FAST_EXTRACTOR_ARGS = 'youtube:player_client=web_embedded,web_safari';
const VIDEO_CODECS = ['avc1', 'h264'];
const AUDIO_CODECS = ['mp4a', 'aac'];
const ANALYSIS_TTL_MS = 10 * 60 * 1000;
const URL_EXPIRY_MARGIN_MS = 60 * 1000;
const PROGRESS_PREFIX = '__YTDLP_PROGRESS__:';
const PROGRESS_TEMPLATE = `download:${PROGRESS_PREFIX}{"id":%(info.format_id)j,"percent":%(progress._percent_str)j,"speed":%(progress._speed_str)j,"eta":%(progress._eta_str)j}`;

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
  const args = ['--no-playlist', '--no-warnings', '--encoding', 'utf-8', '--js-runtimes', `node:${runtimePath}`, '--skip-download'];
  if (fast) args.push('--extractor-args', FAST_EXTRACTOR_ARGS);
  args.push('-J', url);
  return args;
}

function buildFormatSelector(payload) {
  const requested = String(payload.formatId).trim();
  const needsAudio = payload.mergeAudioIfNeeded || (payload.hasVideo !== false && payload.hasAudio === false);
  return needsAudio ? `${requested}+bestaudio[ext=m4a]/${requested}+bestaudio/${requested}` : requested;
}

function buildDownloadArgs({ ffmpegPath, formatSelector, outputDir, url, shouldRecodeToMp4, infoPath, fastExtraction = false, concurrentFragments = downloadConfig.concurrentFragments, runtimePath = process.execPath }) {
  const args = [
    '--newline', '--no-playlist', '--no-warnings', '--encoding', 'utf-8', '--js-runtimes', `node:${runtimePath}`,
    '--progress', '--progress-template', PROGRESS_TEMPLATE,
    '--ffmpeg-location', ffmpegPath, '--format-sort', 'vcodec:h264,acodec:aac', '-f', formatSelector
  ];
  if (concurrentFragments > 1) args.push('-N', String(Math.floor(concurrentFragments)));
  if (fastExtraction) args.push('--extractor-args', FAST_EXTRACTOR_ARGS);
  if (formatSelector.includes('+')) {
    args.push('--merge-output-format', shouldRecodeToMp4 ? 'mkv' : 'mp4');
    if (!shouldRecodeToMp4) args.push('--postprocessor-args', 'Merger+ffmpeg_o:-movflags +faststart');
  }
  args.push('--print', 'after_move:__YTDLP_FILE__:%(filepath)s', '-o', downloadConfig.outputTemplate, '-P', outputDir);
  // Passing the URL as well would ask yt-dlp to download the video twice.
  if (infoPath) args.push('--load-info-json', infoPath);
  else args.push(url);
  return args;
}

function canReuseAnalysis(entry, payload, now = Date.now()) {
  if (!entry?.info || now - entry.at >= ANALYSIS_TTL_MS || entry.info.is_live
    || ['is_live', 'is_upcoming', 'post_live'].includes(entry.info.live_status)) return false;
  const formats = Array.isArray(entry.info.formats) ? entry.info.formats : [];
  const selected = formats.find(format => String(format.format_id) === String(payload.formatId).trim());
  if (!selected) return false;
  const needsAudio = payload.mergeAudioIfNeeded || (payload.hasVideo !== false && payload.hasAudio === false);
  const relevant = [selected, ...(needsAudio ? formats.filter(format => format.vcodec === 'none' && format.acodec !== 'none') : [])];
  return relevant.every(format => [format.url, format.manifest_url, ...(format.fragments || []).map(fragment => fragment.url)].filter(Boolean).every(value => {
    try {
      const expiry = new URL(value).searchParams.get('expire');
      return !expiry || Number(expiry) * 1000 > now + URL_EXPIRY_MARGIN_MS;
    } catch { return false; }
  }));
}

function canRemuxCompatibleMp4(mediaInfo) {
  return mediaInfo.codec === 'h264' && mediaInfo.pixelFormat === 'yuv420p'
    && !mediaInfo.highDynamicRange && !mediaInfo.interlaced && !mediaInfo.rotation
    && (mediaInfo.hasAudio === false || mediaInfo.audioCodec === 'aac');
}

function isStaleAnalysisError(error) {
  return /HTTP Error (?:401|403|410)|(?:URL|link|signature|token)[^\n]*expir|Requested format is not available|No video formats found/i.test(error?.message || '');
}

function buildCachedDownloadInfo(standardInfo, fastInfo) {
  const fastFormats = new Map((fastInfo.formats || []).map(format => [String(format.format_id), format]));
  return { ...standardInfo, formats: standardInfo.formats.map(format => {
    const fast = fastFormats.get(String(format.format_id));
    const sameStream = fast && ['vcodec', 'acodec', 'height', 'fps', 'audio_channels', 'language']
      .every(key => (format[key] ?? null) === (fast[key] ?? null));
    if (!sameStream || !fast.url) return format;
    // Keep the original client's sorting and audio inventory. Reuse only the
    // transport of the very same stream: some default-client URLs require
    // session state that cannot survive an info-json round trip.
    const copy = { ...format };
    for (const key of ['url', 'protocol', 'http_headers', 'downloader_options', 'manifest_url', 'manifest_stream_number', 'fragments', 'fragment_base_url']) {
      if (fast[key] === undefined) delete copy[key];
      else copy[key] = fast[key];
    }
    return copy;
  }) };
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

function createDownloadProgressTracker({ separateAudio = false, recode = false } = {}) {
  const streams = new Map();
  let lastPercent = 0;
  return (line) => {
    if (!line.startsWith(PROGRESS_PREFIX)) return null;
    let data;
    try { data = JSON.parse(line.slice(PROGRESS_PREFIX.length)); } catch { return null; }
    const percent = Number.parseFloat(stripVTControlCharacters(String(data.percent)));
    if (!Number.isFinite(percent)) return null;
    const id = String(data.id);
    streams.set(id, Math.max(streams.get(id) || 0, Math.max(0, Math.min(100, percent))));
    const ratio = [...streams.values()].reduce((sum, value) => sum + value, 0) / (separateAudio ? 2 : 1);
    lastPercent = Math.max(lastPercent, Math.round(Math.min(100, ratio) * (recode ? 0.82 : 0.97)));
    const stage = separateAudio && streams.size > 1 ? 'audio' : 'video';
    const clean = (value) => value && !/^(NA|N\/A|Unknown)/i.test(String(value).trim()) ? String(value).trim() : null;
    return { percent: lastPercent, speed: clean(data.speed), eta: clean(data.eta), stage, raw: stage === 'audio' ? 'Récupération du son…' : 'Récupération de la vidéo…' };
  };
}

class YouTubeService {
  constructor({ ytDlpPath, ffmpegPath, mediaService, processRunner = runProcess, concurrentFragments = downloadConfig.concurrentFragments }) {
    this.ytDlpPath = ytDlpPath;
    this.ffmpegPath = ffmpegPath;
    this.mediaService = mediaService;
    this.runProcess = processRunner;
    this.concurrentFragments = concurrentFragments;
    this.cache = new Map();
    this.preparingAnalyses = new Set();
  }

  env() {
    return { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  }

  async analyze(url, signal) {
    if (signal?.aborted) throw createAbortError();
    for (const preparation of this.preparingAnalyses) {
      if (preparation.url !== url && !preparation.claimed) preparation.controller.abort();
    }
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.at < ANALYSIS_TTL_MS) return cached.data;
    let info;
    let fastExtraction = true;
    const extract = async (fast, extractionSignal = signal) => {
      const result = await this.runProcess(this.ytDlpPath, buildAnalyzeArgs(url, fast), { env: this.env(), signal: extractionSignal, outputLimit: 16 * 1024 * 1024 });
      const value = JSON.parse(result.stdout);
      if (!Array.isArray(value.formats) || !value.formats.length) throw new Error('Aucun format exploitable.');
      return value;
    };
    // Keep the current fast-client format list, but cache the default client's
    // download metadata too: its best audio can differ (e.g. stereo vs 5.1).
    // Prepare download metadata while the user chooses a format and folder;
    // returning the visible analysis does not wait for this preparation.
    const isYouTube = /^https?:\/\/(?:[\w-]+\.)?(?:youtube\.com|youtu\.be)\//i.test(url);
    const preparation = isYouTube ? { url, controller: new AbortController(), claimed: false } : null;
    const abortPreparation = () => preparation?.controller.abort();
    if (preparation) {
      this.preparingAnalyses.add(preparation);
      signal?.addEventListener('abort', abortPreparation, { once: true });
    }
    const standard = preparation ? extract(false, preparation.controller.signal)
      .then(info => ({ info }), error => ({ error }))
      .finally(() => {
        this.preparingAnalyses.delete(preparation);
        signal?.removeEventListener('abort', abortPreparation);
      }) : null;
    try {
      info = await extract(true);
    } catch (fastError) {
      if (fastError?.name === 'AbortError') throw fastError;
      fastExtraction = false;
      const fallback = standard ? await standard : { info: await extract(false) };
      if (fallback.error) throw fallback.error;
      info = fallback.info;
    }
    if (signal?.aborted) throw createAbortError();
    const data = { id: info.id, title: info.title, thumbnail: info.thumbnail, duration: info.duration, uploader: info.uploader, formats: toFormats(info) };
    if (!data.formats.length) throw new Error('Aucune qualité vidéo disponible pour ce lien.');
    const entry = { at: Date.now(), data, info: standard ? null : info, fastExtraction: standard ? false : fastExtraction, preparation };
    if (standard) entry.preparingInfo = standard.then(result => {
      if (result.info) entry.info = buildCachedDownloadInfo(result.info, info);
    });
    this.cache.set(url, entry);
    if (this.cache.size > 20) this.cache.delete(this.cache.keys().next().value);
    return data;
  }

  async download(payload, signal, onProgress) {
    if (signal?.aborted) throw createAbortError();
    const selector = buildFormatSelector(payload);
    const recode = payload.shouldRecodeToMp4 === true;
    const cached = this.cache.get(payload.url);
    if (cached?.preparingInfo) {
      cached.preparation.claimed = true;
      const abortPreparation = () => cached.preparation.controller.abort();
      signal?.addEventListener('abort', abortPreparation, { once: true });
      try { await cached.preparingInfo; }
      finally { signal?.removeEventListener('abort', abortPreparation); }
      if (signal?.aborted) throw createAbortError();
    }
    const reuseAnalysis = canReuseAnalysis(cached, payload);
    let lastPercent = 0;
    const reportProgress = progress => {
      lastPercent = Math.max(lastPercent, progress.percent || 0);
      onProgress?.({ ...progress, percent: lastPercent });
    };
    const stagingDir = await fs.promises.mkdtemp(path.join(path.resolve(payload.outputDir), '.youtube-'));
    try {
      const infoPath = reuseAnalysis ? path.join(stagingDir, 'analysis.info.json') : null;
      if (infoPath) await fs.promises.writeFile(infoPath, JSON.stringify(cached.info), { encoding: 'utf8', mode: 0o600 });
      let downloadedPath = null;
      const trackProgress = createDownloadProgressTracker({ separateAudio: selector.includes('+'), recode });
      const transfer = async storedInfoPath => {
        const args = buildDownloadArgs({ ffmpegPath: this.ffmpegPath, formatSelector: selector,
          outputDir: stagingDir, url: payload.url, shouldRecodeToMp4: recode,
          infoPath: storedInfoPath, fastExtraction: cached?.fastExtraction,
          concurrentFragments: this.concurrentFragments });
        let buffer = '';
        const decoder = new StringDecoder('utf8');
        const readLine = line => {
          if (line.startsWith('__YTDLP_FILE__:')) downloadedPath = path.normalize(line.slice('__YTDLP_FILE__:'.length).trim());
          const progress = trackProgress(line);
          if (progress) reportProgress(progress);
          if (line.startsWith('[Merger]')) reportProgress({ percent: recode ? 82 : 97, stage: 'finalize', speed: null, eta: null, raw: 'Assemblage de l’image et du son…' });
        };
        await this.runProcess(this.ytDlpPath, args, {
          env: this.env(), signal, outputLimit: 128 * 1024,
          onStdout: chunk => {
            buffer += decoder.write(chunk);
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) readLine(line);
          },
          // yt-dlp can itself refresh a failed info-json using its webpage URL.
          onStderr: chunk => {
            if (/trying with URL/.test(chunk.toString())) this.cache.delete(payload.url);
          }
        });
        buffer += decoder.end();
        if (buffer) readLine(buffer);
      };
      try {
        await transfer(infoPath);
      } catch (error) {
        if (!infoPath || signal?.aborted || error?.name === 'AbortError' || !isStaleAnalysisError(error)) throw error;
        this.cache.delete(payload.url);
        downloadedPath = null;
        // Retry the same requested streams once. Existing partial fragments can
        // resume inside this job's directory; no other exports are touched.
        await transfer(null);
      }
      if (!downloadedPath) throw new Error('Le fichier téléchargé est introuvable.');

      let outputPath = downloadedPath;
      if (recode) {
        const mediaInfo = await this.mediaService.inspect(downloadedPath, signal);
        if (canRemuxCompatibleMp4(mediaInfo)) {
          try {
            outputPath = await this.mediaService.remux(downloadedPath, signal, reportProgress);
          } catch (error) {
            if (signal?.aborted || error?.name === 'AbortError') throw error;
            outputPath = null;
          }
        } else outputPath = null;
        if (!outputPath) {
          reportProgress({ percent: 82, stage: 'convert', speed: null, eta: null, raw: 'Préparation du MP4 compatible…' });
          outputPath = await this.mediaService.convert({
            inputPath: downloadedPath,
            outputDir: stagingDir,
            targetHeight: null,
            profileId: 'fast',
            mediaInfo,
            signal,
            onProgress: reportProgress,
            progressRange: [82, 99]
          });
        }
      } else if (!selector.includes('+')) {
        outputPath = await this.mediaService.remux(downloadedPath, signal, reportProgress);
      }
      if (signal?.aborted) throw createAbortError();
      const destination = getAvailableOutputPath(downloadedPath, payload.outputDir);
      await fs.promises.rename(outputPath, destination);
      return { ok: true, outputPath: destination };
    } finally {
      // This directory was created exclusively for this job; existing exports
      // stay outside it and are never touched by cleanup or yt-dlp overwrites.
      // PyInstaller's child may release Windows file handles just after its
      // parent exits. Retry owned-directory cleanup before reporting cancelled.
      await fs.promises.rm(stagingDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 }).catch(() => {});
    }
  }
}

module.exports = {
  YouTubeService,
  buildAnalyzeArgs,
  buildDownloadArgs,
  buildFormatSelector,
  canReuseAnalysis,
  canRemuxCompatibleMp4,
  parseDownloadProgress,
  createDownloadProgressTracker,
  toFormats
};
