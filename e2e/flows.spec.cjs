/* global window */
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const listeners = new Set();
    let current = null;
    let finish = null;
    let sequence = 0;
    const emit = () => listeners.forEach(handler => handler({ ...current }));
    const video = url => ({ id: url.endsWith('a') ? 'a' : 'b', title: url.endsWith('a') ? 'Vidéo A' : 'Vidéo B', formats: [{ id: '18', resolution: '1080p', ext: 'mp4', hasVideo: true, hasAudio: true, quickTimeCompatible: true, fileSizeText: '1 MB' }, { id: '22', resolution: '720p', ext: 'mp4', hasVideo: true, hasAudio: false, quickTimeCompatible: true, fileSizeText: '0.7 MB' }] });
    window.__testIPC = { folderFailure: false, deferredDownload: false, finishDownload: null, conversionFailure: false, calls: [], revealedPaths: [], delay: false, resolve: () => finish?.(), updates: [], dependencyChecks: 0 };
    window.desktopAPI = {
      getStartupInfo: async () => ({ downloadsPath: '/tmp/videos' }),
      checkDependencies: async () => {
        window.__testIPC.dependencyChecks += 1;
        if (window.__testIPC.dependencyChecks === 1) throw new Error('TimeoutError: délai initial de fixture');
        return { downloadsPath: '/tmp/videos', ytDlpVersion: 'fixture', ffmpegVersion: 'ffmpeg version fixture' };
      },
      analyzeVideo: async url => {
        current = { id: String(++sequence), type: 'analysis', state: 'running', percent: 0, startedAt: Date.now(), updatedAt: Date.now(), revision: 1, raw: 'Analyse des formats…' };
        emit();
        if (window.__testIPC.delay) await new Promise(resolve => { finish = resolve; });
        if (current.state === 'cancelled') throw new Error('Opération annulée.');
        current = { ...current, state: 'completed', revision: 2, percent: 100 };
        emit();
        return video(url);
      },
      selectVideoFile: async () => ({ path: '/tmp/source.mov', name: 'Source.mov', width: 1920, height: 1080, size: 1000000, outputOptions: [{ height: null, label: 'Original', estimates: { fast: 1000, balanced: 900, compact: 800 } }, { height: 720, label: '720p', estimates: { fast: 600, balanced: 500, compact: 400 } }] }),
      selectOutputDir: async () => { if (window.__testIPC.folderFailure) throw new Error('Dossier inaccessible.'); return '/tmp/videos'; },
      startDownload: async payload => {
        window.__testIPC.calls.push(payload);
        if (window.__testIPC.deferredDownload) {
          current = { id: String(++sequence), type: 'download', state: 'running', percent: 37, startedAt: Date.now(), revision: 1, raw: 'Téléchargement…' }; emit();
          await new Promise(resolve => { window.__testIPC.finishDownload = () => { current = { ...current, state: 'completed', percent: 100, revision: 2 }; emit(); resolve(); }; });
        }
        return { ok: true, outputPath: '/tmp/videos/result.mp4', outputSize: 400 };
      },
      startConversion: async () => {
        if (window.__testIPC.conversionFailure) {
          current = { id: String(++sequence), type: 'conversion', state: 'failed', percent: 37, startedAt: Date.now(), revision: 1, error: 'Espace disque insuffisant.', raw: 'La tâche a échoué.' }; emit();
          throw new Error('Error invoking remote method \'conversion:start\': Error: Espace disque insuffisant.');
        }
        return { ok: true, outputPath: '/tmp/videos/result.mp4', inputSize: 1000000, outputSize: 400 };
      },
      getCurrentJob: async () => current,
      cancelJob: async () => { current = { ...current, state: 'cancelled', raw: 'Opération annulée.', revision: 2 }; emit(); finish?.(); return { ok: true }; },
      revealPath: async filePath => { window.__testIPC.revealedPaths.push(filePath); return { ok: true }; },
      onDownloadProgress: () => () => {},
      onJobUpdate: handler => { listeners.add(handler); return () => listeners.delete(handler); }
    };
  });
  await page.goto('/');
});

test('initialisation retries a transient failure once and announces readiness', async ({ page }) => {
  await expect(page.getByText('Prêt', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__testIPC.dependencyChecks)).toBe(2);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('changing URL invalidates old formats and download uses the newly analyzed identity', async ({ page }) => {
  const input = page.getByLabel('Lien de la vidéo');
  await input.fill('https://youtu.be/a');
  await page.getByRole('button', { name: 'Analyser les formats' }).click();
  await expect(page.getByRole('heading', { name: 'Vidéo A' })).toBeVisible();
  await input.fill('https://youtu.be/b');
  await expect(page.getByRole('heading', { name: 'Vidéo A' })).toHaveCount(0);
  await expect(page.locator('.formats-actions button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Analyser les formats' }).click();
  await expect(page.getByRole('heading', { name: 'Vidéo B' })).toBeVisible();
  await page.locator('.formats-actions button').click();
  await expect.poll(() => page.evaluate(() => window.__testIPC.calls.length)).toBe(1);
  const [payload] = await page.evaluate(() => window.__testIPC.calls);
  expect(payload.url).toBe('https://youtu.be/b');
  expect(payload.videoId).toBe('b');
});

test('changing URL during an analysis never exposes the old response', async ({ page }) => {
  await page.evaluate(() => { window.__testIPC.delay = true; });
  await page.getByLabel('Lien de la vidéo').fill('https://youtu.be/a');
  await page.getByRole('button', { name: 'Analyser les formats' }).click();
  await expect(page.getByRole('button', { name: 'Annuler', exact: true })).toBeVisible();
  await page.getByLabel('Lien de la vidéo').fill('https://youtu.be/b');
  await page.evaluate(() => window.__testIPC.resolve());
  await expect(page.getByRole('button', { name: 'Analyser les formats' })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Vidéo A' })).toHaveCount(0);
  await expect(page.locator('.formats-actions button')).toHaveCount(0);
});

test('analysis cancellation restores the form and allows a new analysis', async ({ page }) => {
  await page.evaluate(() => { window.__testIPC.delay = true; });
  await page.getByLabel('Lien de la vidéo').fill('https://youtu.be/a');
  await page.getByRole('button', { name: 'Analyser les formats' }).click();
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Analyser les formats' })).toBeEnabled();
  await expect(page.getByText('Analyse annulée', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await page.evaluate(() => { window.__testIPC.delay = false; });
  await page.getByRole('button', { name: 'Analyser les formats' }).click();
  await expect(page.getByRole('heading', { name: 'Vidéo A' })).toBeVisible();
});

test('conversion and mode selections announce their current state and produce a result', async ({ page }) => {
  await page.getByRole('button', { name: 'Convertir', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Convertir', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Sélectionner', exact: true }).click();
  await page.getByRole('button', { name: /720p/ }).click();
  await expect(page.getByRole('button', { name: /720p/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Plus léger/ }).click();
  await expect(page.getByRole('button', { name: /Plus léger/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Convertir la vidéo', exact: true }).click();
  await expect(page.getByText('Vidéo prête', { exact: true })).toBeVisible();
});


test('a folder error stays visible in conversion mode and can be dismissed', async ({ page }) => {
  await page.getByRole('button', { name: 'Convertir', exact: true }).click();
  await page.getByRole('button', { name: 'Sélectionner', exact: true }).click();
  await page.evaluate(() => { window.__testIPC.folderFailure = true; });
  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Dossier inaccessible.');
  await page.getByRole('button', { name: 'Fermer le message d’erreur' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('download locks the quality and keeps a result available across mode changes', async ({ page }) => {
  await page.getByLabel('Lien de la vidéo').fill('https://youtu.be/a');
  await page.getByRole('button', { name: 'Analyser les formats' }).click();
  await page.evaluate(() => { window.__testIPC.deferredDownload = true; });
  await page.locator('.formats-actions button').click();
  await expect(page.getByRole('radio', { name: '720p' })).toBeDisabled();
  await expect(page.getByLabel('Lien de la vidéo')).toBeDisabled();
  await page.evaluate(() => window.__testIPC.finishDownload());
  await expect(page.getByText('Téléchargement terminé', { exact: true })).toBeVisible();
  await expect(page.locator('.result-copy')).toContainText('1080p');
  await page.getByRole('button', { name: 'Convertir', exact: true }).click();
  await expect(page.getByText('result.mp4', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Afficher le fichier' })).toBeEnabled();
  await page.getByRole('button', { name: 'Afficher le fichier' }).click();
  expect(await page.evaluate(() => window.__testIPC.revealedPaths)).toEqual(['/tmp/videos/result.mp4']);
});

test('conversion result keeps the completed recipe when the next settings change', async ({ page }) => {
  await page.getByRole('button', { name: 'Convertir', exact: true }).click();
  await page.getByRole('button', { name: 'Sélectionner', exact: true }).click();
  await page.getByRole('button', { name: /720p/ }).click();
  await page.getByRole('button', { name: /Plus léger/ }).click();
  await page.getByRole('button', { name: 'Convertir la vidéo', exact: true }).click();
  await expect(page.locator('.success-box[role=status]')).toContainText('720p · Plus léger');
  await page.getByRole('button', { name: /Originale/ }).click();
  await page.getByRole('button', { name: /Rapide/ }).click();
  await expect(page.locator('.output-summary')).toContainText('Original · Rapide');
  await expect(page.locator('.result-copy')).toContainText('720p · Plus léger');
});

test('failed tasks show one full error, no progress, and support dismissal and retry', async ({ page }) => {
  await page.getByRole('button', { name: 'Convertir', exact: true }).click();
  await page.getByRole('button', { name: 'Sélectionner', exact: true }).click();
  await page.evaluate(() => { window.__testIPC.conversionFailure = true; });
  await page.getByRole('button', { name: 'Convertir la vidéo', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(1);
  await expect(page.getByRole('alert')).toContainText('Conversion échouée');
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Réessayer la conversion' })).toBeEnabled();
  await page.getByRole('button', { name: 'Fermer le message de tâche' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.evaluate(() => { window.__testIPC.conversionFailure = false; });
  await page.getByRole('button', { name: 'Convertir la vidéo', exact: true }).click();
  await expect(page.getByText('Vidéo prête', { exact: true })).toBeVisible();
});

test('about dialog contains diagnostics and returns focus to its trigger', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'À propos', exact: true });
  await trigger.click();
  await expect(page.getByRole('dialog')).toContainText('Moteurs prêts');
  await expect(page.getByRole('dialog')).toContainText('yt-dlp');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
