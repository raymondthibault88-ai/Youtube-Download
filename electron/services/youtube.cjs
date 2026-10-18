const fs = require('node:fs');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');
const downloadConfig = require('../../shared/download-config.json');
const { runProcess, createAbortError } = require('./process-runner.cjs');
const { getAvailableOutputPath } = require('./media.cjs');
const { toFormats, buildFormatSelector, canRemuxCompatibleMp4 } = require('./youtube/formats.cjs');
const { buildAnalyzeArgs, buildDownloadArgs } = require('./youtube/arguments.cjs');
const { parseDownloadProgress, createDownloadProgressTracker } = require('./youtube/progress.cjs');
const {
  ANALYSIS_TTL_MS,
  canReuseAnalysis,
  isStaleAnalysisError,
  buildCachedDownloadInfo
} = require('./youtube/analysis-cache.cjs');
class YouTubeService {
  constructor({
    ytDlpPath,
    ffmpegPath,
    mediaService,
    processRunner = runProcess,
    concurrentFragments = downloadConfig.concurrentFragments
  }) {
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
      const result = await this.runProcess(this.ytDlpPath, buildAnalyzeArgs(url, fast), {
        env: this.env(),
        signal: extractionSignal,
        outputLimit: 16 * 1024 * 1024
      });
      const value = JSON.parse(result.stdout);
      if (!Array.isArray(value.formats) || !value.formats.length)
        throw new Error('Aucun format exploitable.');
      return value;
    };
    // Keep the current fast-client format list, but cache the default client's
    // download metadata too: its best audio can differ (e.g. stereo vs 5.1).
    // Prepare download metadata while the user chooses a format and folder;
    // returning the visible analysis does not wait for this preparation.
    const isYouTube = /^https?:\/\/(?:[\w-]+\.)?(?:youtube\.com|youtu\.be)\//i.test(url);
    const preparation = isYouTube
      ? { url, controller: new AbortController(), claimed: false }
      : null;
    const abortPreparation = () => preparation?.controller.abort();
    if (preparation) {
      this.preparingAnalyses.add(preparation);
      signal?.addEventListener('abort', abortPreparation, { once: true });
    }
    const standard = preparation
      ? extract(false, preparation.controller.signal)
          .then(
            (info) => ({ info }),
            (error) => ({ error })
          )
          .finally(() => {
            this.preparingAnalyses.delete(preparation);
            signal?.removeEventListener('abort', abortPreparation);
          })
      : null;
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
    const data = {
      id: info.id,
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration,
      uploader: info.uploader,
      formats: toFormats(info)
    };
    if (!data.formats.length) throw new Error('Aucune qualité vidéo disponible pour ce lien.');
    const entry = {
      at: Date.now(),
      data,
      info: standard ? null : info,
      fastExtraction: standard ? false : fastExtraction,
      preparation
    };
    if (standard)
      entry.preparingInfo = standard.then((result) => {
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
      try {
        await cached.preparingInfo;
      } finally {
        signal?.removeEventListener('abort', abortPreparation);
      }
      if (signal?.aborted) throw createAbortError();
    }
    const reuseAnalysis = canReuseAnalysis(cached, payload);
    let lastPercent = 0;
    const reportProgress = (progress) => {
      lastPercent = Math.max(lastPercent, progress.percent || 0);
      onProgress?.({ ...progress, percent: lastPercent });
    };
    const stagingDir = await fs.promises.mkdtemp(
      path.join(path.resolve(payload.outputDir), '.youtube-')
    );
    try {
      const infoPath = reuseAnalysis ? path.join(stagingDir, 'analysis.info.json') : null;
      if (infoPath)
        await fs.promises.writeFile(infoPath, JSON.stringify(cached.info), {
          encoding: 'utf8',
          mode: 0o600
        });
      let downloadedPath = null;
      const trackProgress = createDownloadProgressTracker({
        separateAudio: selector.includes('+'),
        recode
      });
      const transfer = async (storedInfoPath) => {
        const args = buildDownloadArgs({
          ffmpegPath: this.ffmpegPath,
          formatSelector: selector,
          outputDir: stagingDir,
          url: payload.url,
          shouldRecodeToMp4: recode,
          infoPath: storedInfoPath,
          fastExtraction: cached?.fastExtraction,
          concurrentFragments: this.concurrentFragments
        });
        let buffer = '';
        const decoder = new StringDecoder('utf8');
        const readLine = (line) => {
          if (line.startsWith('__YTDLP_FILE__:'))
            downloadedPath = path.normalize(line.slice('__YTDLP_FILE__:'.length).trim());
          const progress = trackProgress(line);
          if (progress) reportProgress(progress);
          if (line.startsWith('[Merger]'))
            reportProgress({
              percent: recode ? 82 : 97,
              stage: 'finalize',
              speed: null,
              eta: null,
              raw: 'Assemblage de l’image et du son…'
            });
        };
        await this.runProcess(this.ytDlpPath, args, {
          env: this.env(),
          signal,
          outputLimit: 128 * 1024,
          onStdout: (chunk) => {
            buffer += decoder.write(chunk);
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) readLine(line);
          },
          // yt-dlp can itself refresh a failed info-json using its webpage URL.
          onStderr: (chunk) => {
            if (/trying with URL/.test(chunk.toString())) this.cache.delete(payload.url);
          }
        });
        buffer += decoder.end();
        if (buffer) readLine(buffer);
      };
      try {
        await transfer(infoPath);
      } catch (error) {
        if (
          !infoPath ||
          signal?.aborted ||
          error?.name === 'AbortError' ||
          !isStaleAnalysisError(error)
        )
          throw error;
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
          reportProgress({
            percent: 82,
            stage: 'convert',
            speed: null,
            eta: null,
            raw: 'Préparation du MP4 compatible…'
          });
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
      await fs.promises
        .rm(stagingDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 })
        .catch(() => {});
    }
  }
}
// Keep the public entry point stable for the IPC layer and existing benchmarks.
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
