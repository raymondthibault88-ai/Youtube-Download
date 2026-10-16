const fs = require('node:fs');
const path = require('node:path');
const { verifyExecutable } = require('./executable-integrity.cjs');
const { runProcess } = require('./process-runner.cjs');

function resolveFfmpegPath({
  isPackaged,
  platform = process.platform,
  arch = process.arch,
  resourcesPath = process.resourcesPath,
  staticBinary
}) {
  const name = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  if (isPackaged) return path.join(resourcesPath, 'ffmpeg', name);
  const bundled = path.join(__dirname, '..', '..', 'build', 'ffmpeg', `${platform}-${arch}`, name);
  if (!staticBinary && fs.existsSync(bundled)) return bundled;
  if (staticBinary === undefined && platform === process.platform) {
    staticBinary = require('ffmpeg-static'); // development/CI fallback only
  }

  return staticBinary?.includes('app.asar')
    ? staticBinary.replace('app.asar', 'app.asar.unpacked')
    : staticBinary;
}

class DependencyService {
  constructor(app) {
    this.app = app;
    this.info = null;
    this.promise = null;
    this.ffmpegInfo = null;
    this.ffmpegPromise = null;
    this.ytDlpInfo = null;
    this.ytDlpPromise = null;
  }

  resolveFfmpegPath() {
    return resolveFfmpegPath({ isPackaged: this.app.isPackaged });
  }

  async getInfo() {
    if (this.info && Date.now() - this.info.at < 5 * 60 * 1000) return this.info.data;
    if (this.promise) return this.promise;
    this.promise = (async () => {
      const [{ ytDlpPath, ytDlpVersion }, { ffmpegPath, ffmpegVersion }] = await Promise.all([
        this.getYtDlpInfo(),
        this.getFfmpegInfo()
      ]);
      const data = {
        ytDlpPath,
        ytDlpVersion,
        ffmpegPath,
        ffmpegVersion,
        downloadsPath: this.app.getPath('downloads')
      };
      this.info = { at: Date.now(), data };
      return data;
    })();
    try {
      return await this.promise;
    } finally {
      this.promise = null;
    }
  }

  async getFfmpegInfo() {
    if (this.ffmpegInfo) return this.ffmpegInfo;
    if (this.ffmpegPromise) return this.ffmpegPromise;
    this.ffmpegPromise = (async () => {
      const ffmpegPath = this.resolveFfmpegPath();
      if (!ffmpegPath || !fs.existsSync(ffmpegPath)) throw new Error('FFmpeg est introuvable. Réinstalle l’application.');
      const manifestPath = path.join(path.dirname(ffmpegPath), 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
        const bytes = await fs.promises.readFile(ffmpegPath);
        if (!verifyExecutable(bytes, manifest, { allowMacSigning: this.app.isPackaged }) || manifest.nonfree !== false) throw new Error('Intégrité ou licence FFmpeg invalide. Réinstalle l’application.');
      }
      const { stdout } = await runProcess(ffmpegPath, ['-version'], { timeoutMs: 30_000 });
      const license = await runProcess(ffmpegPath, ['-L'], { timeoutMs: 30_000 });
      if (/nonfree|not legally redistributable/i.test(license.stdout + license.stderr)) throw new Error('Ce binaire FFmpeg ne peut pas être distribué.');
      this.ffmpegInfo = { ffmpegPath, ffmpegVersion: (stdout.split('\n')[0] || '').trim() };
      return this.ffmpegInfo;
    })();
    try {
      return await this.ffmpegPromise;
    } finally {
      this.ffmpegPromise = null;
    }
  }

  async getYtDlpInfo() {
    if (this.ytDlpInfo) return this.ytDlpInfo;
    if (this.ytDlpPromise) return this.ytDlpPromise;
    this.ytDlpPromise = (async () => {
      const { ensureYtDlp } = require('../ytDlp.cjs');
      const ytDlpPath = await ensureYtDlp(this.app.getPath('userData'));
      const { stdout } = await runProcess(ytDlpPath, ['--ignore-config', '--no-plugin-dirs', '--version'], { timeoutMs: 30_000 });
      this.ytDlpInfo = { ytDlpPath, ytDlpVersion: stdout.trim() };
      return this.ytDlpInfo;
    })();
    try {
      return await this.ytDlpPromise;
    } finally {
      this.ytDlpPromise = null;
    }
  }

  prewarm() {
    return this.getInfo().catch(() => null);
  }
}

module.exports = { DependencyService, resolveFfmpegPath };
