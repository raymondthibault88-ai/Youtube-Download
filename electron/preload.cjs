const { contextBridge, ipcRenderer } = require('electron');

// Sandboxed preload scripts cannot load local modules, so sync is enforced by tests.
const channels = {
  startupInfo: 'app:startupInfo',
  depsCheck: 'deps:check',
  videoAnalyze: 'video:analyze',
  dialogSelectVideo: 'dialog:selectVideo',
  dialogSelectOutput: 'dialog:selectOutput',
  downloadStart: 'download:start',
  conversionStart: 'conversion:start',
  jobCurrent: 'job:current',
  jobCancel: 'job:cancel',
  revealPath: 'dialog:revealPath',
  downloadProgress: 'download:progress',
  conversionProgress: 'conversion:progress',
  jobUpdate: 'job:update'
};

function subscribe(channel, handler) {
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('desktopAPI', {
  getStartupInfo: () => ipcRenderer.invoke(channels.startupInfo),
  checkDependencies: () => ipcRenderer.invoke(channels.depsCheck),
  analyzeVideo: (url) => ipcRenderer.invoke(channels.videoAnalyze, url),
  selectVideoFile: () => ipcRenderer.invoke(channels.dialogSelectVideo),
  selectOutputDir: () => ipcRenderer.invoke(channels.dialogSelectOutput),
  startDownload: (payload) => ipcRenderer.invoke(channels.downloadStart, payload),
  startConversion: (payload) => ipcRenderer.invoke(channels.conversionStart, payload),
  getCurrentJob: () => ipcRenderer.invoke(channels.jobCurrent),
  cancelJob: () => ipcRenderer.invoke(channels.jobCancel),
  revealPath: (targetPath) => ipcRenderer.invoke(channels.revealPath, targetPath),
  onDownloadProgress: (handler) => subscribe(channels.downloadProgress, handler),
  onConversionProgress: (handler) => subscribe(channels.conversionProgress, handler),
  onJobUpdate: (handler) => subscribe(channels.jobUpdate, handler)
});
