const { test, expect, analyze, selectFile, capture } = require('./fixtures.cjs');
const AxeBuilder = require('@axe-core/playwright').default;

test('the first screen has a clear action, real tabs and no idle progress', async ({ page }, testInfo) => {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('YouTube Downloader');
  await expect(page.locator('body')).toHaveCSS('font-family', /"Manrope Variable"/);
  expect(await page.evaluate(() => document.fonts.check('14px "Manrope Variable"', 'YouTube Télécharger'))).toBe(true);
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).toContain("style-src 'self';");
  expect(policy).not.toMatch(/nonce-|unsafe-inline/);
  await expect(page.locator('meta[property="csp-nonce"]')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Télécharger', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Télécharger la vidéo', exact: true })).toBeDisabled();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  expect((await page.locator('.workspace:visible').boundingBox()).height).toBeLessThan(240);
  await expect(page.getByText(/ffmpeg version/)).not.toBeVisible();
  await capture(page, 'v5-01-accueil', testInfo);
});

test('clipboard, recommended quality and output payload preserve the download behavior', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Coller', exact: true }).click();
  await expect(page.getByLabel('Lien YouTube')).toHaveValue('https://youtu.be/VideoA');
  await page.getByRole('button', { name: 'Analyser', exact: true }).click();
  await expect(page.getByRole('radio', { name: '1080p, recommandée, format 137', exact: true })).toBeChecked();
  await capture(page, 'v5-02-video', testInfo);
  await page.getByRole('button', { name: 'Télécharger la vidéo', exact: true }).click();
  const payload = await page.evaluate(() => window.__test.calls.find((entry) => entry.type === 'download').payload);
  expect(payload).toEqual({ url: 'https://youtu.be/VideoA', outputDir: 'C:\\Videos\\Mes exports', formatId: '137', mergeAudioIfNeeded: true, hasVideo: true, hasAudio: false, shouldRecodeToMp4: false });
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '24');
  await page.evaluate(() => window.__test.finish());
  await expect(page.getByRole('heading', { name: 'Fichier enregistré' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__test.calls.filter((entry) => entry.type === 'reveal').length)).toBe(1);
  await capture(page, 'v5-03-resultat', testInfo);
});

test('editing a link invalidates the old formats and a late analysis cannot replace the new source', async ({ page }) => {
  await analyze(page);
  await page.getByLabel('Lien YouTube').fill('https://youtu.be/VideoB');
  await expect(page.getByRole('button', { name: 'Télécharger la vidéo', exact: true })).toBeDisabled();
  await expect(page.getByText('Les beaux jours, au fil de l’eau', { exact: true })).not.toBeVisible();
  await page.evaluate(() => { window.__test.delays['https://youtu.be/SlowA'] = 500; });
  await page.getByLabel('Lien YouTube').fill('https://youtu.be/SlowA');
  await page.getByRole('button', { name: 'Analyser', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Annuler l’analyse' })).toBeVisible();
  await page.getByLabel('Lien YouTube').fill('https://youtu.be/VideoB');
  await page.getByRole('button', { name: 'Analyser', exact: true }).click();
  await expect(page.getByText('Vidéo B — La montagne en été', { exact: true })).toBeVisible();
  await page.waitForTimeout(550);
  await expect(page.getByText('Vidéo B — La montagne en été', { exact: true })).toBeVisible();
  await expect(page.getByText('Les beaux jours, au fil de l’eau', { exact: true })).not.toBeVisible();
});

test('all source formats remain available, with descriptive labels and original recode rules', async ({ page }) => {
  await analyze(page);
  await page.getByRole('button', { name: 'Voir tous les formats' }).click();
  const region = page.getByRole('region', { name: 'Tous les formats source' });
  await expect(region.getByRole('radio')).toHaveCount(10);
  await region.getByRole('radio', { name: /format 248$/ }).check();
  await page.getByRole('button', { name: 'Télécharger la vidéo', exact: true }).click();
  const payload = await page.evaluate(() => window.__test.calls.find((entry) => entry.type === 'download').payload);
  expect(payload.formatId).toBe('248');
  expect(payload.shouldRecodeToMp4).toBe(true);
  expect(payload.mergeAudioIfNeeded).toBe(true);
  await page.evaluate(() => window.__test.finish());
});

test('conversion defaults, resolution and compression profiles retain their engine parameters', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 680 });
  await selectFile(page);
  await expect(page.getByRole('radio', { name: 'Conserver la définition, 1080p' })).toBeChecked();
  await page.getByRole('button', { name: 'Personnaliser la conversion' }).click();
  await page.getByRole('radio', { name: /Plus léger/ }).click();
  await page.getByRole('radio', { name: '720p', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Fichier de sortie' })).toContainText('Plus léger');
  const action = await page.getByRole('button', { name: 'Créer mon MP4' }).boundingBox();
  expect(action.y + action.height).toBeLessThanOrEqual(680);
  await capture(page, 'v5-04-conversion', testInfo);
  await page.getByRole('button', { name: 'Créer mon MP4' }).click();
  const payload = await page.evaluate(() => window.__test.calls.find((entry) => entry.type === 'conversion').payload);
  expect(payload).toEqual({ inputPath: 'C:\\Videos\\Vacances en Bretagne.mov', outputDir: 'C:\\Videos\\Mes exports', targetHeight: 720, profileId: 'compact' });
  await capture(page, 'v5-05-traitement', testInfo);
  await page.evaluate(() => window.__test.finish());
  await expect(page.getByText('36 % d’espace gagné', { exact: true })).toBeVisible();
});

test('a running conversion locks both modes, cancellation is neutral and retry is possible', async ({ page }) => {
  await selectFile(page);
  await page.getByRole('button', { name: 'Créer mon MP4' }).click();
  await page.getByRole('tab', { name: 'Télécharger', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Télécharger la vidéo', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Coller', exact: true })).toBeDisabled();
  await expect(page.getByRole('progressbar')).toHaveCount(1);
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Traitement annulé' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Convertir un fichier' }).click();
  await expect(page.getByRole('button', { name: 'Créer mon MP4' })).toBeEnabled();
  await page.getByRole('button', { name: 'Créer mon MP4' }).click();
  expect(await page.evaluate(() => window.__test.calls.filter((entry) => entry.type === 'conversion').length)).toBe(2);
  await page.evaluate(() => window.__test.finish());
});

test('failure and reveal errors explain the next action without losing the selected file', async ({ page }) => {
  await selectFile(page);
  await page.getByRole('button', { name: 'Créer mon MP4' }).click();
  await page.evaluate(() => window.__test.fail());
  await expect(page.getByRole('alert')).toContainText('L’espace disponible est insuffisant.');
  await expect(page.getByRole('button', { name: 'Créer mon MP4' })).toBeEnabled();
  await page.getByRole('button', { name: 'Créer mon MP4' }).click();
  await page.evaluate(() => window.__test.finish());
  await page.evaluate(() => { window.__test.revealError = true; });
  await page.getByRole('button', { name: 'Afficher le fichier' }).click();
  await expect(page.getByRole('alert')).toContainText('Impossible d’ouvrir le dossier.');
});

test('keyboard tabs and dialogs keep focus and the selected file', async ({ page }) => {
  await page.getByRole('tab', { name: 'Télécharger', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Convertir un fichier' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Choisir une vidéo' }).click();
  await page.getByRole('button', { name: 'À propos', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'À propos', exact: true })).toBeFocused();
  await expect(page.getByText('Vacances en Bretagne.mov', { exact: true })).toBeVisible();
});

test('key states pass automated accessibility checks', async ({ page }) => {
  const check = async () => {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
  };
  await check();
  await analyze(page); await check();
  await selectFile(page);
  await page.getByRole('button', { name: 'Personnaliser la conversion' }).click();
  await check();
  await page.getByRole('button', { name: 'Créer mon MP4' }).click(); await check();
  await page.evaluate(() => window.__test.finish()); await check();
  await page.getByRole('button', { name: 'À propos', exact: true }).click(); await check();
});

test('the action fits desktop windows and the layout reflows without page overflow', async ({ page }, testInfo) => {
  await analyze(page);
  for (const [width, height] of [[1200, 760], [1024, 680], [800, 620], [760, 580], [390, 844]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width >= 1024) {
      const box = await page.getByRole('button', { name: 'Télécharger la vidéo', exact: true }).boundingBox();
      expect(box.y + box.height).toBeLessThanOrEqual(height);
    }
    await capture(page, `v5-responsive-${width}`, testInfo);
  }
  await page.setViewportSize({ width: 1024, height: 680 });
  await page.getByRole('button', { name: 'Voir tous les formats' }).click();
  await page.getByRole('button', { name: 'Télécharger la vidéo', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByRole('progressbar')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Annuler', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Téléchargement en cours…', exact: true })).toBeInViewport();
  await capture(page, 'v5-07-suivi-fixe', testInfo);
  await page.evaluate(() => window.__test.finish());
});
