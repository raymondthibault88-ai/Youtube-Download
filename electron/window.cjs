const path = require('node:path');
const { app, BrowserWindow, Menu } = require('electron');

function createMainWindow({ devUrl }) {
  const mac = process.platform === 'darwin';
  app.setAboutPanelOptions({ applicationName: 'YouTube Downloader', applicationVersion: app.getVersion() });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ label: 'YouTube Downloader', submenu: [{ role: 'about', label: 'À propos de YouTube Downloader' }, { type: 'separator' }, { role: 'hide', label: 'Masquer YouTube Downloader' }, { role: 'hideOthers', label: 'Masquer les autres' }, { role: 'unhide', label: 'Tout afficher' }, { type: 'separator' }, { role: 'quit', label: 'Quitter YouTube Downloader' }] }] : []),
    { label: 'Fichier', submenu: [{ role: 'close', label: 'Fermer la fenêtre' }, ...(!mac ? [{ role: 'quit', label: 'Quitter' }] : [])] },
    { label: 'Édition', submenu: [{ role: 'undo', label: 'Annuler' }, { role: 'redo', label: 'Rétablir' }, { type: 'separator' }, { role: 'cut', label: 'Couper' }, { role: 'copy', label: 'Copier' }, { role: 'paste', label: 'Coller' }, { role: 'selectAll', label: 'Tout sélectionner' }] },
    { label: 'Affichage', submenu: [{ role: 'zoomIn', label: 'Agrandir', accelerator: 'CmdOrCtrl+Plus' }, { role: 'zoomIn', label: 'Agrandir', accelerator: 'CmdOrCtrl+=', visible: false }, { role: 'zoomOut', label: 'Réduire', accelerator: 'CmdOrCtrl+-' }, { role: 'resetZoom', label: 'Taille normale', accelerator: 'CmdOrCtrl+0' }, { type: 'separator' }, { role: 'togglefullscreen', label: 'Plein écran' }] },
    { label: 'Fenêtre', submenu: [{ role: 'minimize', label: 'Réduire la fenêtre' }, ...(mac ? [{ role: 'front', label: 'Tout ramener au premier plan' }] : [])] }
  ]));
  const icon = path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
  const window = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#f5f6f8',
    show: false,
    ...(process.platform === 'darwin' ? {} : { icon }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  window.once('ready-to-show', () => { window.show(); window.focus(); });
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.alt || !(mac ? input.meta : input.control)) return;
    const key = input.key;
    if (!['+', '=', '-', '0'].includes(key)) return;
    event.preventDefault();
    const level = window.webContents.getZoomLevel();
    window.webContents.setZoomLevel(key === '0' ? 0 : Math.max(-3, Math.min(6, level + (key === '-' ? -1 : 1))));
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl !== window.webContents.getURL()) event.preventDefault();
  });
  window.webContents.on('context-menu', (_, params) => {
    const template = params.isEditable
      ? [{ role: 'undo', label: 'Annuler' }, { role: 'redo', label: 'Rétablir' }, { type: 'separator' }, { role: 'cut', label: 'Couper' }, { role: 'copy', label: 'Copier' }, { role: 'paste', label: 'Coller' }, { role: 'selectAll', label: 'Tout sélectionner' }]
      : params.selectionText?.trim() ? [{ role: 'copy', label: 'Copier' }, { role: 'selectAll', label: 'Tout sélectionner' }] : [];
    if (template.length) Menu.buildFromTemplate(template).popup({ window });
  });

  if (devUrl) window.loadURL(devUrl);
  else window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  return window;
}

module.exports = { createMainWindow };
