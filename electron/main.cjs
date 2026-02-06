const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const ffmpegStatic = require('ffmpeg-static');
const { ensureYtDlp } = require('./ytDlp.cjs');
const downloadConfig = require('../shared/download-config.json');

let ytDlpPath = null;

if (process.platform === 'win32') {
  app.setAppUserModelId('com.thibs.youtubedownloader');
}

function getYtDlpJsRuntimeArg() {
  return `node:${process.execPath}`;
}

function getYtDlpEnv() {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1'
  };
}

function resolveFfmpegPath() {
  if (!ffmpegStatic) {
    return null;
  }

  if (ffmpegStatic.includes('app.asar')) {
    return ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
  }

  return ffmpegStatic;
}

function createMainWindow() {
  const windowIconPath = process.platform === 'win32'
    ? path.join(__dirname, 'assets', 'icon.ico')
    : path.join(__dirname, 'assets', 'icon.png');
  const window = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#020617',
    show: false,
    ...(process.platform === 'darwin' ? {} : { icon: windowIconPath }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  window.once('ready-to-show', () => {
    window.show();
  });

  window.webContents.on('context-menu', (_, params) => {
    const hasSelection = Boolean(params.selectionText && params.selectionText.trim());
    const template = [];

    if (params.isEditable) {
      template.push(
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' }
      );
    } else if (hasSelection) {
      template.push(
        { role: 'copy', label: 'Copier' },
        { role: 'selectAll', label: 'Tout sélectionner' }
      );
    }

    if (template.length > 0) {
      Menu.buildFromTemplate(template).popup({ window });
    }
  });
}

function runCommand(commandPath, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandPath, args, {
      ...options,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);

    child.on('close', (code) => {
      flushProgress();
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Commande échouée avec code ${code}`));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function formatBytes(bytes) {
  if (!bytes || Number.isNaN(bytes)) {
    return null;
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let index = 0;
  let value = bytes;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(1)} ${units[index]}`;
}

function toFormats(info) {
  const safeFormats = Array.isArray(info.formats) ? info.formats : [];

  return safeFormats
    .map((format) => {
      const hasVideo = format.vcodec && format.vcodec !== 'none';
      const hasAudio = format.acodec && format.acodec !== 'none';

      return {
        id: format.format_id,
        ext: format.ext,
        protocol: format.protocol,
        resolution: format.resolution || (format.height ? `${format.height}p` : 'audio only'),
        height: format.height || 0,
        fps: format.fps || null,
        hasVideo,
        hasAudio,
        dynamicRange: format.dynamic_range || null,
        note: format.format_note || null,
        fileSize: format.filesize || format.filesize_approx || null,
        fileSizeText: formatBytes(format.filesize || format.filesize_approx),
        vcodec: format.vcodec,
        acodec: format.acodec
      };
    })
    .sort((a, b) => {
      if (b.height !== a.height) {
        return b.height - a.height;
      }

      return (b.fps || 0) - (a.fps || 0);
    });
}

function parseProgress(line) {
  const percentMatch = line.match(/(\d+(?:\.\d+)?)%/);
  const speedMatch = line.match(/at\s+([^\s]+\/?s)/i);
  const etaMatch = line.match(/ETA\s+([^\s]+)/i);

  return {
    percent: percentMatch ? Number(percentMatch[1]) : null,
    speed: speedMatch ? speedMatch[1] : null,
    eta: etaMatch ? etaMatch[1] : null,
    raw: line.trim()
  };
}

function buildFormatSelector(payload) {
  const requestedFormat = String(payload.formatId || '').trim();
  const isVideoDownload = payload.hasVideo !== false;
  const selectedHasAudio = payload.hasAudio !== false;
  const shouldMergeAudio = payload.mergeAudioIfNeeded || (isVideoDownload && !selectedHasAudio);

  if (!shouldMergeAudio) {
    return requestedFormat;
  }

  // Keep the selected video format and prefer m4a audio for better MP4 compatibility.
  return `${requestedFormat}+bestaudio[ext=m4a]/${requestedFormat}+bestaudio/best[acodec!=none]`;
}

function buildAnalyzeArgs(url) {
  return [
    '--no-playlist',
    '--no-warnings',
    '--js-runtimes',
    getYtDlpJsRuntimeArg(),
    '--skip-download',
    '-J',
    url
  ];
}

function buildDownloadArgs({ ffmpegPath, formatSelector, outputDir, url, shouldRecodeToMp4 }) {
  const args = [
    '--newline',
    '--no-playlist',
    '--js-runtimes',
    getYtDlpJsRuntimeArg(),
    '--ffmpeg-location',
    ffmpegPath,
    '-f',
    formatSelector
  ];

  if (shouldRecodeToMp4 || formatSelector.includes('+')) {
    args.push('--merge-output-format', 'mp4');
  }

  if (shouldRecodeToMp4) {
    // Guarantee MP4 output even when source streams are WebM-only.
    args.push('--recode-video', 'mp4');
  }

  args.push(
    '-o',
    downloadConfig.outputTemplate,
    '-P',
    outputDir,
    url
  );

  return args;
}

function emitProgressFromChunk(onProgress, chunk, stdoutBuffer) {
  const nextBuffer = `${stdoutBuffer}${chunk.toString()}`;
  const lines = nextBuffer.split('\n').map((line) => line.trim());
  const remainingBuffer = lines.pop() || '';

  for (const line of lines) {
    if (!line) {
      continue;
    }

    if (line.includes('[download]')) {
      onProgress(parseProgress(line));
    }
  }

  return remainingBuffer;
}

function runYtDlpDownload(event, ytDlpArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(ytDlpPath, ytDlpArgs, {
      windowsHide: true,
      env: getYtDlpEnv()
    });

    let stderr = '';
    let stdoutBuffer = '';
    let lastEmit = 0;
    let pendingPayload = null;
    let flushTimer = null;
    const emitIntervalMs = 200;

    const flushProgress = () => {
      if (pendingPayload) {
        event.sender.send('download:progress', pendingPayload);
        pendingPayload = null;
        lastEmit = Date.now();
      }
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    };

    const onProgress = (payload) => {
      pendingPayload = payload;
      const now = Date.now();
      const elapsed = now - lastEmit;
      if (elapsed >= emitIntervalMs) {
        flushProgress();
      } else if (!flushTimer) {
        flushTimer = setTimeout(flushProgress, emitIntervalMs - elapsed);
      }
    };

    child.stdout.on('data', (chunk) => {
      stdoutBuffer = emitProgressFromChunk(onProgress, chunk, stdoutBuffer);
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);

    child.on('close', (code) => {
      flushProgress();
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Téléchargement échoué (code ${code})`));
        return;
      }

      resolve({ ok: true });
    });
  });
}

function shouldRetryWithRecode(error) {
  const message = String(error?.message || '').toLowerCase();

  const retryableMarkers = [
    'could not write header',
    'incompatible with output codec',
    'could not find tag for codec',
    'not currently supported in container',
    'error while opening encoder',
    'conversion failed',
    'invalid audio stream',
    'invalid video stream',
    'cannot mux'
  ];

  return retryableMarkers.some((marker) => message.includes(marker));
}

ipcMain.handle('deps:check', async () => {
  ytDlpPath = await ensureYtDlp(app.getPath('userData'));

  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    throw new Error('FFmpeg introuvable. Vérifie l\'installation de ffmpeg-static.');
  }

  const [{ stdout: ytDlpVersion }, { stdout: ffmpegVersionRaw }] = await Promise.all([
    runCommand(ytDlpPath, ['--version']),
    runCommand(ffmpegPath, ['-version'])
  ]);

  const ffmpegVersion = ffmpegVersionRaw.split('\n')[0] || ffmpegVersionRaw.trim();

  return {
    ytDlpPath,
    ytDlpVersion: ytDlpVersion.trim(),
    ffmpegPath,
    ffmpegVersion: ffmpegVersion.trim(),
    downloadsPath: app.getPath('downloads')
  };
});

ipcMain.handle('video:analyze', async (_, url) => {
  if (!ytDlpPath) {
    ytDlpPath = await ensureYtDlp(app.getPath('userData'));
  }

  const { stdout } = await runCommand(ytDlpPath, buildAnalyzeArgs(url), { env: getYtDlpEnv() });

  const info = JSON.parse(stdout);

  return {
    id: info.id,
    title: info.title,
    thumbnail: info.thumbnail,
    duration: info.duration,
    uploader: info.uploader,
    formats: toFormats(info)
  };
});

ipcMain.handle('dialog:selectOutput', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  });

  if (canceled || !filePaths[0]) {
    return null;
  }

  return filePaths[0];
});

ipcMain.handle('download:start', async (event, payload) => {
  if (!ytDlpPath) {
    ytDlpPath = await ensureYtDlp(app.getPath('userData'));
  }

  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    throw new Error('FFmpeg introuvable. Vérifie l\'installation de ffmpeg-static.');
  }

  if (!payload || !payload.url || !payload.formatId || !payload.outputDir) {
    throw new Error('Paramètres de téléchargement invalides.');
  }

  const formatSelector = buildFormatSelector(payload);
  const isVideoDownload = payload.hasVideo !== false;
  const args = buildDownloadArgs({
    ffmpegPath,
    formatSelector,
    outputDir: payload.outputDir,
    url: payload.url,
    shouldRecodeToMp4: false
  });

  try {
    await runYtDlpDownload(event, args);
  } catch (error) {
    if (!isVideoDownload || !shouldRetryWithRecode(error)) {
      throw error;
    }

    event.sender.send('download:progress', {
      ...downloadConfig.initialProgress,
      raw: 'Remux MP4 impossible, tentative de réencodage...'
    });

    const fallbackArgs = buildDownloadArgs({
      ffmpegPath,
      formatSelector,
      outputDir: payload.outputDir,
      url: payload.url,
      shouldRecodeToMp4: true
    });

    await runYtDlpDownload(event, fallbackArgs);
  }

  return { ok: true };
});

app.whenReady().then(createMainWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

