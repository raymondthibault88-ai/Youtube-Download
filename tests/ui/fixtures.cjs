const fs = require('node:fs');
const path = require('node:path');
const { test: base, expect } = require('@playwright/test');

const test = base.extend({
  bridgeOptions: [{}, { option: true }],
  page: async ({ page, context, bridgeOptions }, use) => {
    const root = path.resolve(__dirname, '../../dist');
    await context.route('http://video.test/**', async (route) => {
      const name =
        decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '') ||
        'index.html';
      const filePath = path.resolve(root, name);
      if (!filePath.startsWith(root + path.sep) || !fs.existsSync(filePath))
        return route.fulfill({ status: 404, body: 'Not found' });
      const mime = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2'
      };
      return route.fulfill({
        contentType: mime[path.extname(filePath)] || 'application/octet-stream',
        body: fs.readFileSync(filePath)
      });
    });
    await page.addInitScript((options) => {
      const handlers = new Set();
      const updateHandlers = new Set();
      const accountHandlers = new Set();
      let account = {
        configured: Boolean(options.accountConfigured),
        connected: false,
        connecting: false,
        channel: null,
        error: null
      };
      const emitAccount = (patch) => {
        account = { ...account, ...patch };
        for (const handler of accountHandlers) handler(account);
        return account;
      };
      const libraryItems = [
        {
          id: 'BaW_jenozKc',
          title: 'Balade au bord de l’eau',
          url: 'https://www.youtube.com/watch?v=BaW_jenozKc',
          thumbnail: null,
          duration: 180,
          available: true
        },
        {
          id: 'jNQXAC9IVRw',
          title: 'Montagne en été',
          url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
          thumbnail: null,
          duration: 240,
          available: true
        },
        {
          id: 'M7lc1UVf-VE',
          title: 'Vidéo indisponible',
          url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
          thumbnail: null,
          duration: null,
          available: false,
          reason: 'Vidéo privée ou supprimée'
        }
      ];
      let update = {
        mode: 'automatic',
        status: 'idle',
        currentVersion: '5.0.0',
        version: null,
        percent: 0,
        error: null,
        checkedAt: null
      };
      const emitUpdate = (patch) => {
        update = { ...update, ...patch };
        for (const handler of updateHandlers) handler(update);
        return update;
      };
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
      ].map(([id, resolution, ext, videoCodec, hasAudio, quickTimeCompatible], index) => ({
        id,
        resolution,
        ext,
        videoCodec,
        hasAudio,
        quickTimeCompatible,
        hasVideo: true,
        fps: 30,
        audioCodec: hasAudio ? 'mp4a.40.2' : null,
        fileSizeText: `${Math.round(680 / (index + 1))} MB`
      }));
      const emit = (patch) => {
        job = { ...job, ...patch };
        for (const handler of handlers) handler(job);
      };
      const begin = (type, payload) => {
        window.__test.calls.push({ type, payload });
        if (job && ['running', 'cancelling'].includes(job.state))
          return Promise.reject(new Error('Une tâche est déjà en cours.'));
        job = {
          id: String(Date.now()),
          type,
          state: 'running',
          percent: 24,
          speed: type !== 'conversion' ? '2.4 MB/s' : '1.8×',
          eta: '00:24',
          raw: type !== 'conversion' ? 'Récupération de la vidéo…' : 'Préparation du MP4…',
          ...(type === 'batch'
            ? {
                batch: {
                  total: payload.items.length,
                  index: 1,
                  completed: 0,
                  failed: 0,
                  currentTitle: payload.items[0].title
                }
              }
            : {}),
          startedAt: Date.now(),
          updatedAt: Date.now(),
          result: null,
          error: null
        };
        emit({});
        return new Promise((resolve, reject) => {
          settle = { resolve, reject };
        });
      };
      const thumbnail =
        'data:image/svg+xml,' +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#e5ecda"/><circle cx="460" cy="110" r="65" fill="#edbc9c"/><path d="M0 280 180 110 380 360H0" fill="#738b65"/><path d="m230 360 190-190 220 190" fill="#315a45"/></svg>'
        );
      const dependencies = {
        downloadsPath: 'C:\\Videos\\Mes exports',
        ytDlpVersion: '2026.08.19',
        ffmpegVersion: 'ffmpeg version 7.1.1'
      };
      let resolveDependencies;
      let rejectInitialUpdate;
      const dependencyCheck = options.deferDependencies
        ? new Promise((resolve) => {
            resolveDependencies = resolve;
          })
        : Promise.resolve(dependencies);
      const initialUpdate = options.deferInitialUpdate
        ? new Promise((resolve, reject) => {
            rejectInitialUpdate = reject;
          })
        : Promise.resolve(update);
      window.__test = {
        completeDependencyCheck: () => resolveDependencies?.(dependencies),
        failInitialUpdate: () => rejectInitialUpdate?.(new Error('Initial IPC failed')),
        calls: [],
        delays: {},
        revealError: false,
        updateCheckError: false,
        setUpdate: emitUpdate,
        setAccount: emitAccount,
        libraryItems,
        finishBatch: (failedIds = []) => {
          const request = window.__test.calls.filter((call) => call.type === 'batch').at(-1);
          const items = request.payload.items.map((item) => ({
            ...item,
            state: failedIds.includes(item.id) ? 'failed' : 'completed',
            ...(failedIds.includes(item.id)
              ? { error: 'Cette vidéo n’est pas accessible.' }
              : { outputPath: `C:\\Videos\\Mes exports\\${item.title}.mp4` })
          }));
          const result = {
            ok: !failedIds.length,
            items,
            completed: items.length - failedIds.length,
            failed: failedIds.length,
            cancelled: 0,
            total: items.length,
            outputPath: items.find((item) => item.outputPath)?.outputPath
          };
          emit({ state: 'completed', percent: 100, speed: null, eta: null, result });
          settle.resolve(result);
          settle = null;
        },
        finish: () => {
          const result = {
            ok: true,
            outputPath,
            ...(job.type === 'conversion' ? { inputSize: 314572800, outputSize: 201326592 } : {})
          };
          emit({
            state: 'completed',
            percent: 100,
            speed: null,
            eta: null,
            raw: 'Fichier enregistré.',
            result
          });
          settle.resolve(result);
          settle = null;
        },
        fail: () => {
          const error = new Error('ENOSPC: no space left on device');
          emit({ state: 'failed', error: error.message });
          settle.reject(error);
          settle = null;
        },
        progress: (percent) => emit({ percent })
      };
      window.desktopAPI = {
        getStartupInfo: async () => ({
          downloadsPath: options.emptyStartupDirectory ? '' : 'C:\\Videos\\Mes exports'
        }),
        checkDependencies: async () => dependencyCheck,
        readClipboard: async () => {
          window.__test.calls.push({ type: 'clipboard' });
          return 'https://youtu.be/VideoA';
        },
        cancelVideoAnalysis: async () => {
          window.__test.calls.push({ type: 'cancelAnalysis' });
          return { ok: true };
        },
        analyzeVideo: async (url) => {
          window.__test.calls.push({ type: 'analyze', url });
          if (window.__test.delays[url])
            await new Promise((resolve) => setTimeout(resolve, window.__test.delays[url]));
          return {
            id: url,
            title: url.includes('VideoB')
              ? 'Vidéo B — La montagne en été'
              : 'Les beaux jours, au fil de l’eau',
            uploader: 'Carnets de voyage',
            thumbnail,
            duration: 723,
            formats
          };
        },
        selectVideoFile: async () => ({
          path: 'C:\\Videos\\Vacances en Bretagne.mov',
          name: 'Vacances en Bretagne.mov',
          size: 314572800,
          duration: 723,
          width: 1920,
          height: 1080,
          bitrate: 5000000,
          outputOptions: [
            {
              height: null,
              label: 'Original · 1080p',
              estimates: { fast: 304087500, balanced: 282397500, compact: 223044000 }
            },
            {
              height: 720,
              label: '720p',
              estimates: { fast: 258472500, balanced: 240397500, compact: 190305000 }
            },
            {
              height: 480,
              label: '480p',
              estimates: { fast: 131586000, balanced: 122910000, compact: 99051000 }
            }
          ]
        }),
        selectOutputDir: async () => {
          window.__test.calls.push({ type: 'selectOutputDir' });
          return 'C:\\Videos\\Un autre dossier';
        },
        startDownload: (payload) => begin('download', payload),
        startConversion: (payload) => begin('conversion', payload),
        startBatchDownload: (payload) => begin('batch', payload),
        importLibrary: async (source) => {
          window.__test.calls.push({ type: 'library:import', source });
          if (window.__test.delays[source])
            await new Promise((resolve) => setTimeout(resolve, window.__test.delays[source]));
          return {
            id: source,
            title: source.includes('@')
              ? 'Chaîne de voyage'
              : source.includes('PL_B')
                ? 'Playlist B'
                : 'Mes voyages',
            sourceUrl: source,
            kind: source.includes('@') ? 'channel' : 'playlist',
            items: window.__test.libraryItems,
            total: window.__test.libraryItems.length,
            truncated: false,
            nextPageToken: null
          };
        },
        cancelLibraryImport: async () => {
          window.__test.calls.push({ type: 'library:cancel' });
          return { ok: true };
        },
        getYouTubeAccount: async () => account,
        onYouTubeAccount: (handler) => {
          accountHandlers.add(handler);
          return () => accountHandlers.delete(handler);
        },
        configureYouTubeAccount: async () => {
          window.__test.calls.push({ type: 'account:configure' });
          return emitAccount({ configured: true });
        },
        connectYouTubeAccount: async () => {
          window.__test.calls.push({ type: 'account:connect' });
          return emitAccount({
            connected: true,
            channel: {
              id: 'UCtest',
              title: 'Ma chaîne',
              thumbnail: null,
              uploadsPlaylistId: 'UUtest'
            }
          });
        },
        cancelYouTubeAccount: async () => {
          emitAccount({ connecting: false });
          return { ok: true };
        },
        disconnectYouTubeAccount: async () => {
          window.__test.calls.push({ type: 'account:disconnect' });
          return emitAccount({ connected: false, channel: null });
        },
        getAccountPlaylists: async (pageToken) => ({
          items: [
            {
              id: pageToken ? 'PLsecond' : 'PLfirst',
              title: pageToken ? 'Deuxième playlist' : 'Ma playlist privée',
              thumbnail: null,
              videoCount: 3
            }
          ],
          nextPageToken: pageToken ? null : 'page2'
        }),
        getAccountVideos: async (playlistId, pageToken) => {
          window.__test.calls.push({ type: 'account:videos', playlistId, pageToken });
          return {
            items: pageToken ? [libraryItems[1]] : [libraryItems[0]],
            nextPageToken: pageToken ? null : 'page2'
          };
        },
        getCurrentJob: async () => job,
        getUpdateState: async () => initialUpdate,
        onUpdateState: (handler) => {
          updateHandlers.add(handler);
          return () => updateHandlers.delete(handler);
        },
        checkForUpdates: async () => {
          window.__test.calls.push({ type: 'update:check' });
          return window.__test.updateCheckError
            ? emitUpdate({
                status: 'error',
                error:
                  'Impossible de récupérer la mise à jour. Vérifiez votre connexion et réessayez.'
              })
            : emitUpdate({ status: 'available', version: '5.0.1', error: null });
        },
        downloadUpdate: async () => {
          window.__test.calls.push({ type: 'update:download' });
          return emitUpdate({ status: 'downloading', percent: 0 });
        },
        installUpdate: async () => {
          window.__test.calls.push({ type: 'update:install' });
          return emitUpdate({ status: 'installing' });
        },
        openUpdateRelease: async () => {
          window.__test.calls.push({ type: 'update:openRelease' });
          return { ok: true };
        },
        cancelJob: async () => {
          const batchItems =
            job?.type === 'batch'
              ? window.__test.calls.filter((call) => call.type === 'batch').at(-1).payload.items
              : null;
          emit({
            state: 'cancelled',
            raw: 'Opération annulée.',
            error: null,
            ...(batchItems
              ? {
                  result: {
                    ok: false,
                    items: batchItems.map((item) => ({ ...item, state: 'cancelled' })),
                    completed: 0,
                    failed: 0,
                    cancelled: batchItems.length,
                    total: batchItems.length
                  }
                }
              : {})
          });
          const error = new Error('Opération annulée.');
          error.name = 'AbortError';
          settle?.reject(error);
          settle = null;
          return { ok: true };
        },
        revealPath: async (targetPath) => {
          window.__test.calls.push({ type: 'reveal', targetPath });
          return window.__test.revealError
            ? { ok: false, error: 'Impossible d’ouvrir le dossier.' }
            : { ok: true };
        },
        onJobUpdate: (handler) => {
          handlers.add(handler);
          return () => handlers.delete(handler);
        },
        onDownloadProgress: () => () => {},
        onConversionProgress: () => () => {}
      };
    }, bridgeOptions);
    await page.goto('http://video.test/');
    await expect(page.locator('body')).toHaveClass(/app-ready/);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('#splash')).toHaveCount(0);
    await expect(page.locator('.workflow-panel:visible')).toHaveCSS('opacity', '1');
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
  await page.screenshot({
    path: path.join(directory, `${name}.png`),
    fullPage: false,
    animations: 'disabled'
  });
}
module.exports = { test, expect, analyze, selectFile, capture };
