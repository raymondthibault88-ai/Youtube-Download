const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const downloadConfig = require('../shared/download-config.json');
const ipcChannels = require('../shared/ipc.json');
const { formatBytes } = require('../shared/formatters.js');

let ytDlpPath = null;
let mainWindow = null;
const analyzeCache = new Map();
const ANALYZE_CACHE_TTL_MS = 10 * 60 * 1000;
let dependencyInfoCache = null;
let dependencyInfoPromise = null;
const DEPENDENCY_CACHE_TTL_MS = 5 * 60 * 1000;

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

async function ensureYtDlpPath() {
  if (ytDlpPath) {
    return ytDlpPath;
  }

  const { ensureYtDlp } = require('./ytDlp.cjs');
  ytDlpPath = await ensureYtDlp(app.getPath('userData'));
  return ytDlpPath;
}

function resolveFfmpegPath() {
  // Lazy load to reduce main-process startup work.
  const ffmpegStatic = require('ffmpeg-static');
  if (!ffmpegStatic) {
    return null;
  }

  if (ffmpegStatic.includes('app.asar')) {
    return ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
  }

  return ffmpegStatic;
}

async function getDependencyInfo() {
  if (dependencyInfoCache && Date.now() - dependencyInfoCache.at < DEPENDENCY_CACHE_TTL_MS) {
    return dependencyInfoCache.data;
  }

  if (dependencyInfoPromise) {
    return dependencyInfoPromise;
  }

  dependencyInfoPromise = (async () => {
    const ensuredYtDlpPath = await ensureYtDlpPath();

    const ffmpegPath = resolveFfmpegPath();
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
      throw new Error('FFmpeg introuvable. Vérifie l\'installation de ffmpeg-static.');
    }

    const [{ stdout: ytDlpVersion }, { stdout: ffmpegVersionRaw }] = await Promise.all([
      runCommand(ensuredYtDlpPath, ['--version']),
      runCommand(ffmpegPath, ['-version'])
    ]);

    const ffmpegVersion = ffmpegVersionRaw.split('\n')[0] || ffmpegVersionRaw.trim();

    const payload = {
      ytDlpPath,
      ytDlpVersion: ytDlpVersion.trim(),
      ffmpegPath,
      ffmpegVersion: ffmpegVersion.trim(),
      downloadsPath: app.getPath('downloads')
    };

    dependencyInfoCache = { at: Date.now(), data: payload };
    return payload;
  })();

  try {
    return await dependencyInfoPromise;
  } finally {
    dependencyInfoPromise = null;
  }
}

function createMainWindow() {
  Menu.setApplicationMenu(null);
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

  window.once('ready-to-show', () => {
    window.show();
    window.focus();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

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

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  mainWindow = window;
  return window;
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
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Commande échouée avec code ${code}`));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function toFormats(info) {
  const safeFormats = Array.isArray(info.formats) ? info.formats : [];

  const mapped = safeFormats.map((format) => {
    const hasVideo = format.vcodec && format.vcodec !== 'none';
    const hasAudio = format.acodec && format.acodec !== 'none';
    const height = format.height || 0;

    return {
      id: format.format_id,
      ext: format.ext,
      resolution: format.resolution || (height ? `${height}p` : 'audio only'),
      height,
      fps: format.fps || null,
      hasVideo,
      hasAudio,
      fileSizeText: formatBytes(format.filesize || format.filesize_approx)
    };
  });

  return mapped
    .filter((format) => format.hasVideo)
    .sort((a, b) => {
      if (b.height !== a.height) {
        return b.height - a.height;
      }

      return (b.fps || 0) - (a.fps || 0);
    })
    .map(({ height, ...rest }) => rest);
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
  const jsRuntime = getYtDlpJsRuntimeArg();
  return [
    '--no-playlist',
    '--no-warnings',
    '--js-runtimes',
    jsRuntime,
    '--skip-download',
    '-J',
    url
  ];
}

function buildDownloadArgs({ ffmpegPath, formatSelector, outputDir, url, shouldRecodeToMp4 }) {
  const jsRuntime = getYtDlpJsRuntimeArg();
  const args = [
    '--newline',
    '--no-playlist',
    '--js-runtimes',
    jsRuntime,
    '--ffmpeg-location',
    ffmpegPath,
    '-f',
    formatSelector
  ];

  const concurrentFragments = Number(downloadConfig.concurrentFragments || 0);
  if (Number.isFinite(concurrentFragments) && concurrentFragments > 1) {
    args.push('-N', String(Math.floor(concurrentFragments)));
  }

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
        event.sender.send(ipcChannels.events.downloadProgress, pendingPayload);
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

ipcMain.handle(ipcChannels.invoke.startupInfo, () => {
  return {
    downloadsPath: app.getPath('downloads')
  };
});

ipcMain.handle(ipcChannels.invoke.depsCheck, async () => {
  return getDependencyInfo();
});

ipcMain.handle(ipcChannels.invoke.videoAnalyze, async (_, url) => {
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl) {
    throw new Error('URL invalide.');
  }

  const cached = analyzeCache.get(normalizedUrl);
  if (cached && Date.now() - cached.at < ANALYZE_CACHE_TTL_MS) {
    return cached.data;
  }

  const ensuredYtDlpPath = await ensureYtDlpPath();

  const { stdout } = await runCommand(ensuredYtDlpPath, buildAnalyzeArgs(normalizedUrl), { env: getYtDlpEnv() });

  const info = JSON.parse(stdout);

  const payload = {
    id: info.id,
    title: info.title,
    thumbnail: info.thumbnail,
    duration: info.duration,
    uploader: info.uploader,
    formats: toFormats(info)
  };

  analyzeCache.set(normalizedUrl, { at: Date.now(), data: payload });
  if (analyzeCache.size > 20) {
    const oldestKey = analyzeCache.keys().next().value;
    if (oldestKey) {
      analyzeCache.delete(oldestKey);
    }
  }

  return payload;
});

ipcMain.handle(ipcChannels.invoke.dialogSelectOutput, async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  });

  if (canceled || !filePaths[0]) {
    return null;
  }

  return filePaths[0];
});

ipcMain.handle(ipcChannels.invoke.downloadStart, async (event, payload) => {
  await ensureYtDlpPath();

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

    event.sender.send(ipcChannels.events.downloadProgress, {
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

ipcMain.handle(ipcChannels.invoke.openPath, async (_, targetPath) => {
  if (!targetPath) {
    return { ok: false };
  }

  const result = await shell.openPath(targetPath);
  return { ok: result === '', error: result || null };
});


const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createMainWindow);
}

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


