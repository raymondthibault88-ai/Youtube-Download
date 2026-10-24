const { contextBridge, ipcRenderer } = require('electron');

// Sandboxed preload scripts cannot load local modules, so sync is enforced by tests.
const channels = {
  startupInfo: 'app:startupInfo',
  depsCheck: 'deps:check',
  videoAnalyze: 'video:analyze',
  videoCancelAnalyze: 'video:cancelAnalyze',
  clipboardRead: 'clipboard:readText',
  dialogSelectVideo: 'dialog:selectVideo',
  dialogSelectOutput: 'dialog:selectOutput',
  downloadStart: 'download:start',
  conversionStart: 'conversion:start',
  jobCurrent: 'job:current',
  jobCancel: 'job:cancel',
  revealPath: 'dialog:revealPath',
  updateCurrent: 'update:current',
  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  updateOpenRelease: 'update:openRelease',
  downloadProgress: 'download:progress',
  conversionProgress: 'conversion:progress',
  jobUpdate: 'job:update',
  updateState: 'update:state',
  libraryImport: 'library:import',
  libraryCancel: 'library:cancel',
  downloadBatch: 'download:batch',
  accountCurrent: 'youtubeAccount:current',
  accountConnect: 'youtubeAccount:connect',
  accountCancel: 'youtubeAccount:cancel',
  accountConfigure: 'youtubeAccount:configure',
  accountDisconnect: 'youtubeAccount:disconnect',
  accountPlaylists: 'youtubeAccount:playlists',
  accountVideos: 'youtubeAccount:videos',
  accountState: 'youtubeAccount:state'
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
  cancelVideoAnalysis: () => ipcRenderer.invoke(channels.videoCancelAnalyze),
  readClipboard: () => ipcRenderer.invoke(channels.clipboardRead),
  selectVideoFile: () => ipcRenderer.invoke(channels.dialogSelectVideo),
  selectOutputDir: () => ipcRenderer.invoke(channels.dialogSelectOutput),
  startDownload: (payload) => ipcRenderer.invoke(channels.downloadStart, payload),
  startConversion: (payload) => ipcRenderer.invoke(channels.conversionStart, payload),
  getCurrentJob: () => ipcRenderer.invoke(channels.jobCurrent),
  cancelJob: () => ipcRenderer.invoke(channels.jobCancel),
  revealPath: (targetPath) => ipcRenderer.invoke(channels.revealPath, targetPath),
  getUpdateState: () => ipcRenderer.invoke(channels.updateCurrent),
  checkForUpdates: () => ipcRenderer.invoke(channels.updateCheck),
  downloadUpdate: () => ipcRenderer.invoke(channels.updateDownload),
  installUpdate: () => ipcRenderer.invoke(channels.updateInstall),
  openUpdateRelease: () => ipcRenderer.invoke(channels.updateOpenRelease),
  onUpdateState: (handler) => subscribe(channels.updateState, handler),
  onDownloadProgress: (handler) => subscribe(channels.downloadProgress, handler),
  onConversionProgress: (handler) => subscribe(channels.conversionProgress, handler),
  onJobUpdate: (handler) => subscribe(channels.jobUpdate, handler),
  importLibrary: (source) => ipcRenderer.invoke(channels.libraryImport, source),
  cancelLibraryImport: () => ipcRenderer.invoke(channels.libraryCancel),
  startBatchDownload: (payload) => ipcRenderer.invoke(channels.downloadBatch, payload),
  getYouTubeAccount: () => ipcRenderer.invoke(channels.accountCurrent),
  connectYouTubeAccount: () => ipcRenderer.invoke(channels.accountConnect),
  cancelYouTubeAccount: () => ipcRenderer.invoke(channels.accountCancel),
  configureYouTubeAccount: () => ipcRenderer.invoke(channels.accountConfigure),
  disconnectYouTubeAccount: () => ipcRenderer.invoke(channels.accountDisconnect),
  getAccountPlaylists: (pageToken) => ipcRenderer.invoke(channels.accountPlaylists, pageToken),
  getAccountVideos: (playlistId, pageToken) =>
    ipcRenderer.invoke(channels.accountVideos, playlistId, pageToken),
  onYouTubeAccount: (handler) => subscribe(channels.accountState, handler)
});
