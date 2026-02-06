const { contextBridge, ipcRenderer } = require('electron');

const ipcChannels = {
  invoke: {
    startupInfo: 'app:startupInfo',
    depsCheck: 'deps:check',
    videoAnalyze: 'video:analyze',
    dialogSelectOutput: 'dialog:selectOutput',
    downloadStart: 'download:start',
    openPath: 'dialog:openPath'
  },
  events: {
    downloadProgress: 'download:progress'
  }
};

contextBridge.exposeInMainWorld('desktopAPI', {
  getStartupInfo: () => ipcRenderer.invoke(ipcChannels.invoke.startupInfo),
  checkDependencies: () => ipcRenderer.invoke(ipcChannels.invoke.depsCheck),
  analyzeVideo: (url) => ipcRenderer.invoke(ipcChannels.invoke.videoAnalyze, url),
  selectOutputDir: () => ipcRenderer.invoke(ipcChannels.invoke.dialogSelectOutput),
  startDownload: (payload) => ipcRenderer.invoke(ipcChannels.invoke.downloadStart, payload),
  openPath: (targetPath) => ipcRenderer.invoke(ipcChannels.invoke.openPath, targetPath),
  onDownloadProgress: (handler) => {
    const listener = (_, payload) => handler(payload);
    ipcRenderer.on(ipcChannels.events.downloadProgress, listener);
    return () => ipcRenderer.removeListener(ipcChannels.events.downloadProgress, listener);
  }
});
