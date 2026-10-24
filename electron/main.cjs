const { app, BrowserWindow, ipcMain, session, shell, safeStorage } = require('electron');
const { autoUpdater } = require('electron-updater');
const { UpdateService } = require('./services/updates.cjs');
const { YouTubeAccountService } = require('./services/youtube-account.cjs');
const ipcChannels = require('../shared/ipc.json');
const { registerHandlers } = require('./ipc/register-handlers.cjs');
const { DependencyService } = require('./services/dependencies.cjs');
const { createMainWindow } = require('./window.cjs');
const { hasActiveProcesses, shutdownProcesses } = require('./services/process-runner.cjs');

let mainWindow = null;
let jobs = null;
let updates = null;
let finishingQuit = false;
let youtubeAccount = null;

if (process.platform === 'win32') app.setAppUserModelId('com.thibs.youtubedownloader');
app.enableSandbox();

function getDevUrl() {
  if (app.isPackaged) return null;
  const raw = process.env.VITE_DEV_SERVER_URL;
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return ['http:', 'https:'].includes(parsed.protocol) &&
      ['localhost', '127.0.0.1'].includes(parsed.hostname)
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function focusMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', focusMainWindow);
  app.whenReady().then(() => {
    const devUrl = getDevUrl();
    const devOrigin = devUrl ? new URL(devUrl).origin : null;
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
      callback(false)
    );
    session.defaultSession.setPermissionCheckHandler(() => false);

    const dependencies = new DependencyService(app);
    youtubeAccount = new YouTubeAccountService({
      app,
      safeStorage,
      openExternal: (url) => shell.openExternal(url),
      notify: (snapshot) => {
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
            window.webContents.send(ipcChannels.events.accountState, snapshot);
          }
        }
      }
    });
    const accountReady = youtubeAccount.init().catch(() => youtubeAccount.snapshot());
    updates = new UpdateService({
      app,
      updater: autoUpdater,
      isBusy: () =>
        ['running', 'cancelling'].includes(jobs?.snapshot()?.state) ||
        youtubeAccount?.snapshot().connecting ||
        hasActiveProcesses(),
      openExternal: (url) => shell.openExternal(url),
      notify: (snapshot) => {
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed() && !window.webContents.isDestroyed())
            window.webContents.send(ipcChannels.events.updateState, snapshot);
        }
      }
    });
    jobs = registerHandlers({
      app,
      ipcMain,
      dependencyService: dependencies,
      updateService: updates,
      devOrigin,
      accountService: youtubeAccount,
      accountReady
    });
    mainWindow = createMainWindow({ devUrl });
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
    setImmediate(() => {
      void dependencies.prewarm();
    });
    updates.start();
  });
}

app.on('before-quit', (event) => {
  updates?.dispose();
  youtubeAccount?.dispose();
  const busy = jobs?.snapshot() && ['running', 'cancelling'].includes(jobs.snapshot().state);
  if (finishingQuit || (!busy && !hasActiveProcesses())) return;
  event.preventDefault();
  finishingQuit = true;
  void Promise.all([jobs?.shutdown(), shutdownProcesses()]).finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow({ devUrl: getDevUrl() });
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }
});
