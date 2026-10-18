const fs = require('node:fs');
const path = require('node:path');
const { test: base, expect } = require('@playwright/test');

const test = base.extend({
  page: async ({ page, context }, use) => {
    const root = path.resolve(__dirname, '../../dist');
    await context.route('http://video.test/**', async (route) => {
      const name = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '') || 'index.html';
      const filePath = path.resolve(root, name);
      if (!filePath.startsWith(root + path.sep) || !fs.existsSync(filePath)) return route.fulfill({ status: 404, body: 'Not found' });
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
      return route.fulfill({ contentType: mime[path.extname(filePath)] || 'application/octet-stream', body: fs.readFileSync(filePath) });
    });
    await page.addInitScript(() => {
      const handlers = new Set();
      const updateHandlers = new Set();
      let update = { mode: 'automatic', status: 'idle', currentVersion: '5.0.0', version: null, percent: 0, error: null, checkedAt: null };
      const emitUpdate = (patch) => { update = { ...update, ...patch }; for (const handler of updateHandlers) handler(update); return update; };
      let job = null;
      let settle = null;
      const outputPath = 'C:\\Videos\\Mes exports\\Ma vidéo.mp4';
      const formats = [
        ['401', '3840x2160', 'mp4', 'av01.0.12M.08', false, false],
        ['313', '3840x2160', 'webm', 'vp9', false, false],
        ['271', '2560x1440', 'webm', 'vp9', false, false],
        ['137', '1920x1080', 'mp4', 'avc1.640028', false, true],
        ['248', '1920x1080', 'webm', 'vp9', false, false],
        ['136', '1280x720', 'mp4', 'avc1.4d401f', false, true],
        ['22', '1280x720', 'mp4', 'avc1.64001f', true, true],
        ['135', '854x480', 'mp4', 'avc1.4d401e', false, true],
        ['134', '640x360', 'mp4', 'avc1.4d401e', false, true],
        ['18', '640x360', 'mp4', 'avc1.42001e', true, true]
      ].map(([id, resolution, ext, videoCodec, hasAudio, quickTimeCompatible], index) => ({ id, resolution, ext, videoCodec, hasAudio, quickTimeCompatible, hasVideo: true, fps: 30, audioCodec: hasAudio ? 'mp4a.40.2' : null, fileSizeText: `${Math.round(680 / (index + 1))} MB` }));
      const emit = (patch) => { job = { ...job, ...patch }; for (const handler of handlers) handler(job); };
      const begin = (type, payload) => {
        window.__test.calls.push({ type, payload });
        if (job && ['running', 'cancelling'].includes(job.state)) return Promise.reject(new Error('Une tâche est déjà en cours.'));
        job = { id: String(Date.now()), type, state: 'running', percent: 24, speed: type === 'download' ? '2.4 MB/s' : '1.8×', eta: '00:24', raw: type === 'download' ? 'Récupération de la vidéo…' : 'Préparation du MP4…', startedAt: Date.now(), updatedAt: Date.now(), result: null, error: null };
        emit({});
        return new Promise((resolve, reject) => { settle = { resolve, reject }; });
      };
      const thumbnail = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#e5ecda"/><circle cx="460" cy="110" r="65" fill="#edbc9c"/><path d="M0 280 180 110 380 360H0" fill="#738b65"/><path d="m230 360 190-190 220 190" fill="#315a45"/></svg>');
      window.__test = {
        calls: [], delays: {}, revealError: false, updateCheckError: false,
        setUpdate: emitUpdate,
        finish: () => {
          const result = { ok: true, outputPath, ...(job.type === 'conversion' ? { inputSize: 314572800, outputSize: 201326592 } : {}) };
          emit({ state: 'completed', percent: 100, speed: null, eta: null, raw: 'Fichier enregistré.', result });
          settle.resolve(result); settle = null;
        },
        fail: () => { const error = new Error('ENOSPC: no space left on device'); emit({ state: 'failed', error: error.message }); settle.reject(error); settle = null; },
        progress: (percent) => emit({ percent })
      };
      window.desktopAPI = {
        getStartupInfo: async () => ({ downloadsPath: 'C:\\Videos\\Mes exports' }),
        checkDependencies: async () => ({ downloadsPath: 'C:\\Videos\\Mes exports', ytDlpVersion: '2026.08.19', ffmpegVersion: 'ffmpeg version 7.1.1' }),
        readClipboard: async () => { window.__test.calls.push({ type: 'clipboard' }); return 'https://youtu.be/VideoA'; },
        cancelVideoAnalysis: async () => { window.__test.calls.push({ type: 'cancelAnalysis' }); return { ok: true }; },
        analyzeVideo: async (url) => {
          window.__test.calls.push({ type: 'analyze', url });
          if (window.__test.delays[url]) await new Promise((resolve) => setTimeout(resolve, window.__test.delays[url]));
          return { id: url, title: url.includes('VideoB') ? 'Vidéo B — La montagne en été' : 'Les beaux jours, au fil de l’eau', uploader: 'Carnets de voyage', thumbnail, duration: 723, formats };
        },
        selectVideoFile: async () => ({ path: 'C:\\Videos\\Vacances en Bretagne.mov', name: 'Vacances en Bretagne.mov', size: 314572800, duration: 723, width: 1920, height: 1080, bitrate: 5000000, outputOptions: [
          { height: null, label: 'Original · 1080p', estimates: { fast: 304087500, balanced: 282397500, compact: 223044000 } },
          { height: 720, label: '720p', estimates: { fast: 258472500, balanced: 240397500, compact: 190305000 } },
          { height: 480, label: '480p', estimates: { fast: 131586000, balanced: 122910000, compact: 99051000 } }
        ] }),
        selectOutputDir: async () => 'C:\\Videos\\Un autre dossier',
        startDownload: (payload) => begin('download', payload),
        startConversion: (payload) => begin('conversion', payload),
        getCurrentJob: async () => job,
        getUpdateState: async () => update,
        onUpdateState: (handler) => { updateHandlers.add(handler); return () => updateHandlers.delete(handler); },
        checkForUpdates: async () => {
          window.__test.calls.push({ type: 'update:check' });
          return window.__test.updateCheckError
            ? emitUpdate({ status: 'error', error: 'Impossible de récupérer la mise à jour. Vérifiez votre connexion et réessayez.' })
            : emitUpdate({ status: 'available', version: '5.0.1', error: null });
        },
        downloadUpdate: async () => { window.__test.calls.push({ type: 'update:download' }); return emitUpdate({ status: 'downloading', percent: 0 }); },
        installUpdate: async () => { window.__test.calls.push({ type: 'update:install' }); return emitUpdate({ status: 'installing' }); },
        openUpdateRelease: async () => { window.__test.calls.push({ type: 'update:openRelease' }); return { ok: true }; },
        cancelJob: async () => { emit({ state: 'cancelled', raw: 'Opération annulée.', error: null }); const error = new Error('Opération annulée.'); error.name = 'AbortError'; settle?.reject(error); settle = null; return { ok: true }; },
        revealPath: async (targetPath) => { window.__test.calls.push({ type: 'reveal', targetPath }); return window.__test.revealError ? { ok: false, error: 'Impossible d’ouvrir le dossier.' } : { ok: true }; },
        onJobUpdate: (handler) => { handlers.add(handler); return () => handlers.delete(handler); },
        onDownloadProgress: () => () => {}, onConversionProgress: () => () => {}
      };
    });
    await page.goto('http://video.test/');
    await expect(page.locator('body')).toHaveClass(/app-ready/);
    await page.evaluate(() => document.fonts.ready);
    await use(page);
  }
});

async function analyze(page, url = 'https://youtu.be/VideoA') {
  await page.getByLabel('Lien YouTube').fill(url);
  await page.getByRole('button', { name: 'Analyser', exact: true }).click();
  await expect(page.getByRole('radiogroup', { name: 'Qualité' })).toBeVisible();
}
async function selectFile(page) {
  await page.getByRole('tab', { name: 'Convertir / compresser' }).click();
  await page.getByRole('button', { name: 'Choisir une vidéo' }).click();
  await expect(page.getByText('Vacances en Bretagne.mov', { exact: true })).toBeVisible();
}
async function capture(page, name, testInfo) {
  const directory = process.env.V5_ARTIFACT_DIR || testInfo.outputDir;
  fs.mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, `${name}.png`), fullPage: false, animations: 'disabled' });
}
module.exports = { test, expect, analyze, selectFile, capture };
