const fs = require('node:fs');
const { runProcess } = require('./process-runner.cjs');

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
    const binary = require('ffmpeg-static');
    return binary?.includes('app.asar') ? binary.replace('app.asar', 'app.asar.unpacked') : binary;
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
      const { stdout } = await runProcess(ffmpegPath, ['-version']);
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
      const { stdout } = await runProcess(ytDlpPath, ['--version']);
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

module.exports = { DependencyService };
