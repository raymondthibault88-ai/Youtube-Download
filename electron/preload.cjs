const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  checkDependencies: () => ipcRenderer.invoke('deps:check'),
  analyzeVideo: (url) => ipcRenderer.invoke('video:analyze', url),
  selectOutputDir: () => ipcRenderer.invoke('dialog:selectOutput'),
  startDownload: (payload) => ipcRenderer.invoke('download:start', payload),
  onDownloadProgress: (handler) => {
    const listener = (_, payload) => handler(payload);
    ipcRenderer.on('download:progress', listener);
    return () => ipcRenderer.removeListener('download:progress', listener);
  }
});
