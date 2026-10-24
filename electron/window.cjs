const path = require('node:path');
const { BrowserWindow, Menu } = require('electron');

function createMainWindow({ devUrl }) {
  const icon = path.join(
    __dirname,
    'assets',
    process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  );
  const window = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 760,
    minHeight: 580,
    backgroundColor: '#f7f7f8',
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

  window.once('ready-to-show', () => {
    window.show();
    window.focus();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl !== window.webContents.getURL()) event.preventDefault();
  });
  window.webContents.on('context-menu', (_, params) => {
    const template = params.isEditable
      ? [
          { role: 'undo', label: 'Annuler' },
          { role: 'redo', label: 'Rétablir' },
          { type: 'separator' },
          { role: 'cut', label: 'Couper' },
          { role: 'copy', label: 'Copier' },
          { role: 'paste', label: 'Coller' },
          { role: 'selectAll', label: 'Tout sélectionner' }
        ]
      : params.selectionText?.trim()
        ? [
            { role: 'copy', label: 'Copier' },
            { role: 'selectAll', label: 'Tout sélectionner' }
          ]
        : [];
    if (template.length) Menu.buildFromTemplate(template).popup({ window });
  });

  if (devUrl) window.loadURL(devUrl);
  else window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  return window;
}

module.exports = { createMainWindow };
