const fs = require('node:fs');
const path = require('node:path');
const { dialog, shell } = require('electron');
const ipcChannels = require('../../shared/ipc.json');
const { JobManager } = require('../services/job-manager.cjs');
const { MediaService, buildOutputOptions } = require('../services/media.cjs');
const { YouTubeService } = require('../services/youtube.cjs');
const { requireAbsolutePath, validateFormatId, validateSender, validateYouTubeUrl } = require('../services/validation.cjs');

function registerHandlers({ app, ipcMain, dependencyService, devOrigin }) {
  const jobs = new JobManager({ channel: ipcChannels.events.jobUpdate });
  const selectedInputs = new Set();
  const revealablePaths = new Set();
  let mediaPromise = null;
  let youtubePromise = null;

  const assertSender = (event) => validateSender(event, { appPath: app.getAppPath(), devOrigin });
  const getMedia = async () => {
    if (!mediaPromise) {
      mediaPromise = dependencyService.getFfmpegInfo().then((info) => new MediaService(info.ffmpegPath)).catch((error) => {
        mediaPromise = null;
        throw error;
      });
    }
    return mediaPromise;
  };
  const getYoutube = async () => {
    if (!youtubePromise) {
      youtubePromise = Promise.all([dependencyService.getYtDlpInfo(), dependencyService.getFfmpegInfo(), getMedia()])
        .then(([ytDlp, ffmpeg, media]) => new YouTubeService({ ytDlpPath: ytDlp.ytDlpPath, ffmpegPath: ffmpeg.ffmpegPath, mediaService: media }))
        .catch((error) => {
          youtubePromise = null;
          throw error;
        });
    }
    return youtubePromise;
  };

  const handle = (channel, handler) => {
    ipcMain.handle(channel, async (event, ...args) => {
      assertSender(event);
      return handler(event, ...args);
    });
  };

  handle(ipcChannels.invoke.startupInfo, async () => ({ downloadsPath: app.getPath('downloads') }));
  handle(ipcChannels.invoke.depsCheck, async () => dependencyService.getInfo());
  handle(ipcChannels.invoke.jobCurrent, async () => jobs.snapshot());
  handle(ipcChannels.invoke.jobCancel, async () => ({ ok: jobs.cancel() }));

  handle(ipcChannels.invoke.videoAnalyze, async (_, rawUrl) => {
    const url = validateYouTubeUrl(rawUrl);
    const youtube = await getYoutube();
    return youtube.analyze(url);
  });

  handle(ipcChannels.invoke.dialogSelectOutput, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return canceled ? null : filePaths[0] || null;
  });

  handle(ipcChannels.invoke.dialogSelectVideo, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Fichiers vidéo', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'mts', 'm2ts', 'wmv'] }]
    });
    if (canceled || !filePaths[0]) return null;
    const filePath = path.normalize(filePaths[0]);
    selectedInputs.add(filePath);
    const [media, stats] = await Promise.all([getMedia(), fs.promises.stat(filePath)]);
    const mediaInfo = await media.inspect(filePath);
    return {
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
      ...mediaInfo,
      outputOptions: buildOutputOptions(mediaInfo)
    };
  });

  handle(ipcChannels.invoke.conversionStart, async (event, payload) => {
    const inputPath = requireAbsolutePath(payload?.inputPath, 'Fichier source');
    if (!selectedInputs.has(inputPath) || !fs.existsSync(inputPath)) throw new Error('Sélectionne à nouveau le fichier source.');
    const outputDir = payload?.outputDir ? requireAbsolutePath(payload.outputDir, 'Dossier de sortie') : path.dirname(inputPath);
    const targetHeight = payload?.targetHeight == null ? null : Number(payload.targetHeight);
    if (targetHeight !== null && ![2160, 1440, 1080, 720, 480].includes(targetHeight)) throw new Error('Résolution de sortie invalide.');
    const profileId = ['fast', 'balanced', 'compact'].includes(payload?.profileId) ? payload.profileId : 'fast';
    const media = await getMedia();
    return jobs.start('conversion', event.sender, async ({ signal, update }) => {
      const inputStats = await fs.promises.stat(inputPath);
      update({ percent: 1, raw: 'Analyse de la vidéo…' });
      const mediaInfo = await media.inspect(inputPath, signal);
      const onProgress = (progress) => {
        update(progress);
        if (!event.sender.isDestroyed()) event.sender.send(ipcChannels.events.conversionProgress, progress);
      };
      const outputPath = await media.convert({ inputPath, outputDir, targetHeight, profileId, mediaInfo, signal, onProgress });
      const outputStats = await fs.promises.stat(outputPath);
      revealablePaths.add(outputPath);
      return { ok: true, outputPath, inputSize: inputStats.size, outputSize: outputStats.size };
    });
  });

  handle(ipcChannels.invoke.downloadStart, async (event, payload) => {
    const cleanPayload = {
      url: validateYouTubeUrl(payload?.url),
      outputDir: requireAbsolutePath(payload?.outputDir, 'Dossier de sortie'),
      formatId: validateFormatId(payload?.formatId),
      mergeAudioIfNeeded: payload?.mergeAudioIfNeeded === true,
      hasVideo: payload?.hasVideo !== false,
      hasAudio: payload?.hasAudio !== false,
      shouldRecodeToMp4: payload?.shouldRecodeToMp4 === true
    };
    await fs.promises.mkdir(cleanPayload.outputDir, { recursive: true });
    const youtube = await getYoutube();
    return jobs.start('download', event.sender, async ({ signal, update }) => {
      const result = await youtube.download(cleanPayload, signal, (progress) => {
        update(progress);
        if (!event.sender.isDestroyed()) event.sender.send(ipcChannels.events.downloadProgress, progress);
      });
      revealablePaths.add(result.outputPath);
      return result;
    });
  });

  handle(ipcChannels.invoke.revealPath, async (_, rawPath) => {
    const targetPath = requireAbsolutePath(rawPath, 'Chemin');
    const downloadsPath = path.normalize(app.getPath('downloads'));
    const allowed = revealablePaths.has(targetPath) || targetPath === downloadsPath;
    if (!allowed || !fs.existsSync(targetPath)) throw new Error('Ce fichier ne peut pas être affiché.');
    const stats = await fs.promises.stat(targetPath);
    if (stats.isDirectory()) {
      const error = await shell.openPath(targetPath);
      return { ok: error === '', error: error || null };
    }
    shell.showItemInFolder(targetPath);
    return { ok: true, error: null };
  });

  return jobs;
}

module.exports = { registerHandlers };
