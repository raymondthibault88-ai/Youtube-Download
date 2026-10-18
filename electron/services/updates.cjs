const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
// electron-builder removes the build configuration from the packaged package.json.
const releasesUrl = 'https://github.com/raymondthibault88-ai/Youtube-Download/releases';

function hasMacDistributionSignature(appPath) {
  const result = spawnSync('/usr/bin/codesign', ['--display', '--verbose=2', appPath], { encoding: 'utf8', timeout: 3000 });
  return result.status === 0 && /^Authority=Developer ID Application:/m.test(result.stderr || '');
}

function getUpdateMode({ app, platform, env, resourcesPath, macSigned }) {
  if (!app.isPackaged || !['win32', 'darwin'].includes(platform)) return 'disabled';
  if (!fs.existsSync(path.join(resourcesPath, 'app-update.yml'))) return 'disabled';
  if (platform === 'win32') return env.PORTABLE_EXECUTABLE_FILE || env.PORTABLE_EXECUTABLE_DIR ? 'manual' : 'automatic';
  return macSigned() ? 'automatic' : 'manual';
}

function updateErrorMessage(error) {
  if (['ERR_UPDATER_NO_PUBLISHED_VERSIONS', 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND'].includes(error?.code) || /No published versions on GitHub/.test(error?.message || '')) {
    return 'Aucune version publique disponible sur GitHub pour le moment.';
  }
  if (error?.code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND') {
    return 'La dernière version GitHub ne contient pas encore les fichiers de mise à jour. Vous pouvez la consulter sur GitHub.';
  }
  if (['ERR_UPDATER_INVALID_SIGNATURE', 'ERR_UPDATER_CHECKSUM_MISMATCH'].includes(error?.code) || /checksum|sha512|signature/i.test(error?.message || '')) {
    return 'La mise à jour n’a pas pu être vérifiée. Elle ne sera pas installée. Réessayez plus tard.';
  }
  return 'Impossible de récupérer la mise à jour. Vérifiez votre connexion et réessayez.';
}

class UpdateService {
  constructor({ app, updater, notify, isBusy, openExternal, platform = process.platform, env = process.env, resourcesPath = process.resourcesPath, macSigned = () => hasMacDistributionSignature(path.resolve(app.getAppPath(), '../../..')) }) {
    this.app = app;
    this.updater = updater;
    this.notify = notify;
    this.isBusy = isBusy;
    this.openExternal = openExternal;
    this.operation = null;
    this.timer = null;
    this.state = {
      mode: getUpdateMode({ app, platform, env, resourcesPath, macSigned }),
      status: 'idle',
      currentVersion: app.getVersion(),
      version: null,
      percent: 0,
      error: null,
      checkedAt: null
    };
    if (this.state.mode === 'disabled') { this.state.status = 'disabled'; return; }

    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.disableWebInstaller = true;
    updater.on('error', (error) => this.fail(error));
    updater.on('update-available', (info) => this.emit({ status: 'available', version: info.version, percent: 0, error: null, checkedAt: Date.now() }));
    updater.on('update-not-available', () => this.emit({ status: 'not-available', version: null, percent: 0, error: null, checkedAt: Date.now() }));
    updater.on('download-progress', (progress) => {
      if (this.state.status !== 'downloading') return;
      const percent = Number(progress.percent);
      if (Number.isFinite(percent)) this.emit({ percent: Math.max(this.state.percent, Math.min(100, Math.max(0, percent))) });
    });
    updater.on('update-downloaded', (info) => this.emit({ status: 'downloaded', version: info.version, percent: 100, error: null }));
  }

  snapshot() { return { ...this.state }; }

  emit(patch) {
    Object.assign(this.state, patch);
    this.notify(this.snapshot());
  }

  fail(error) { this.emit({ status: 'error', percent: 0, error: updateErrorMessage(error) }); }

  start() {
    if (this.state.mode === 'disabled' || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; void this.check(); }, 8000);
    this.timer.unref?.();
  }

  dispose() { clearTimeout(this.timer); this.timer = null; }

  async check() {
    if (this.state.mode === 'disabled' || ['downloaded', 'installing'].includes(this.state.status)) return this.snapshot();
    if (this.operation) return this.operation;
    this.emit({ status: 'checking', error: null, percent: 0 });
    this.operation = (async () => {
      try { await this.updater.checkForUpdates(); }
      catch (error) { this.fail(error); }
      return this.snapshot();
    })();
    try { return await this.operation; }
    finally { this.operation = null; }
  }

  async download() {
    if (this.operation) return this.operation;
    if (this.state.mode !== 'automatic' || this.state.status !== 'available') throw new Error('Vérifiez d’abord si une mise à jour est disponible.');
    this.emit({ status: 'downloading', percent: 0, error: null });
    this.operation = (async () => {
      try { await this.updater.downloadUpdate(); }
      catch (error) { this.fail(error); }
      return this.snapshot();
    })();
    try { return await this.operation; }
    finally { this.operation = null; }
  }

  assertCanStartJob() {
    if (this.state.status === 'installing') throw new Error('La mise à jour est en cours d’installation. Patientez jusqu’au redémarrage.');
  }

  install() {
    if (this.state.mode !== 'automatic' || this.state.status !== 'downloaded') throw new Error('Téléchargez d’abord la mise à jour.');
    if (this.isBusy()) throw new Error('Attendez la fin du téléchargement ou de la conversion avant de redémarrer.');
    this.emit({ status: 'installing', error: null });
    setImmediate(() => {
      try { this.updater.quitAndInstall(false, true); }
      catch (error) { this.fail(error); }
    });
    return this.snapshot();
  }

  async openReleasePage() {
    await this.openExternal(releasesUrl);
    return { ok: true };
  }
}

module.exports = { UpdateService, getUpdateMode, updateErrorMessage, releasesUrl };
