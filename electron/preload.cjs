const { contextBridge, ipcRenderer } = require('electron');

const ipcChannels = {
  invoke: {
    startupInfo: 'app:startupInfo',
    depsCheck: 'deps:check',
    videoAnalyze: 'video:analyze',
    dialogSelectVideo: 'dialog:selectVideo',
    dialogSelectOutput: 'dialog:selectOutput',
    downloadStart: 'download:start',
    conversionStart: 'conversion:start',
    openPath: 'dialog:openPath'
  },
  events: {
    downloadProgress: 'download:progress',
    conversionProgress: 'conversion:progress'
  }
};

contextBridge.exposeInMainWorld('desktopAPI', {
  getStartupInfo: () => ipcRenderer.invoke(ipcChannels.invoke.startupInfo),
  checkDependencies: () => ipcRenderer.invoke(ipcChannels.invoke.depsCheck),
  analyzeVideo: (url) => ipcRenderer.invoke(ipcChannels.invoke.videoAnalyze, url),
  selectVideoFile: () => ipcRenderer.invoke(ipcChannels.invoke.dialogSelectVideo),
  selectOutputDir: () => ipcRenderer.invoke(ipcChannels.invoke.dialogSelectOutput),
  startDownload: (payload) => ipcRenderer.invoke(ipcChannels.invoke.downloadStart, payload),
  startConversion: (payload) => ipcRenderer.invoke(ipcChannels.invoke.conversionStart, payload),
  openPath: (targetPath) => ipcRenderer.invoke(ipcChannels.invoke.openPath, targetPath),
  onDownloadProgress: (handler) => {
    const listener = (_, payload) => handler(payload);
    ipcRenderer.on(ipcChannels.events.downloadProgress, listener);
    return () => ipcRenderer.removeListener(ipcChannels.events.downloadProgress, listener);
  },
  onConversionProgress: (handler) => {
    const listener = (_, payload) => handler(payload);
    ipcRenderer.on(ipcChannels.events.conversionProgress, listener);
    return () => ipcRenderer.removeListener(ipcChannels.events.conversionProgress, listener);
  }
});
