const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const version = require('../package.json').version;
const html = path.join(root, 'dist', 'index.html');
if (!fs.existsSync(html) || !fs.readFileSync(html, 'utf8').includes('V5.2')) {
  throw new Error('Construisez la version test avec npm run build avant de la lancer.');
}
const profile = path.join(root, 'test-results', 'v5.2', 'preview-user-data');
const binaryDirectory = path.join(profile, 'bin');
fs.mkdirSync(binaryDirectory, { recursive: true });
const applicationData =
  process.platform === 'win32'
    ? process.env.APPDATA
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
if (applicationData) {
  const name =
    process.platform === 'win32'
      ? 'yt-dlp.exe'
      : process.platform === 'darwin'
        ? 'yt-dlp_macos'
        : 'yt-dlp_linux';
  const existing = path.join(applicationData, 'youtube-downloader-desktop', 'bin', name);
  const target = path.join(binaryDirectory, name);
  if (fs.existsSync(existing) && !fs.existsSync(target)) fs.copyFileSync(existing, target);
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
const child = spawn(
  require('electron'),
  [`--user-data-dir=${profile}`, root, '--library-preview'],
  {
    cwd: root,
    env,
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  }
);
child.once('error', (error) => {
  console.error(`Impossible de lancer la version test : ${error.message}`);
  process.exitCode = 1;
});
child.once('spawn', () => {
  child.unref();
  console.log(`Version test ${version} lancée (PID ${child.pid}). Profil isolé : ${profile}`);
});
