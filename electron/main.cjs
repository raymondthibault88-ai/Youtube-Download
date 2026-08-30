const { app, BrowserWindow, ipcMain, session } = require('electron');
const { registerHandlers } = require('./ipc/register-handlers.cjs');
const { DependencyService } = require('./services/dependencies.cjs');
const { createMainWindow } = require('./window.cjs');

let mainWindow = null;

if (process.platform === 'win32') app.setAppUserModelId('com.thibs.youtubedownloader');
app.enableSandbox();

function getDevUrl() {
  if (app.isPackaged) return null;
  const raw = process.env.VITE_DEV_SERVER_URL;
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return ['localhost', '127.0.0.1'].includes(parsed.hostname) ? parsed.toString() : null;
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
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);

    const dependencies = new DependencyService(app);
    registerHandlers({ app, ipcMain, dependencyService: dependencies, devOrigin });
    mainWindow = createMainWindow({ devUrl });
    mainWindow.on('closed', () => { mainWindow = null; });
    setImmediate(() => { void dependencies.prewarm(); });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow({ devUrl: getDevUrl() });
    mainWindow.on('closed', () => { mainWindow = null; });
  }
});
