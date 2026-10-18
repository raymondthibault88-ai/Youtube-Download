const { test, expect, selectFile, capture } = require('./fixtures.cjs');
const AxeBuilder = require('@axe-core/playwright').default;

test('checking, downloading and restarting are separate explicit actions with visible status', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'À propos', exact: true }).click();
  await page.getByRole('button', { name: 'Vérifier les mises à jour', exact: true }).click();
  await expect(page.getByText('La version 5.0.1 est disponible.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__test.calls.filter((entry) => entry.type === 'update:download').length)).toBe(0);
  await page.getByRole('button', { name: 'Télécharger la mise à jour', exact: true }).click();
  await page.evaluate(() => window.__test.setUpdate({ percent: 46.8 }));
  await expect(page.getByRole('dialog')).toContainText('Téléchargement de la mise à jour : 46 %');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Voir la mise à jour' })).toContainText('46 %');
  await page.evaluate(() => window.__test.setUpdate({ status: 'downloaded', percent: 100 }));
  await page.getByRole('button', { name: 'Voir la mise à jour' }).click();
  await expect(page.getByRole('button', { name: 'Redémarrer et installer', exact: true })).toBeEnabled();
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations.map(({ id }) => id)).toEqual([]);
  await capture(page, 'v5-update-ready', testInfo);
  expect(await page.evaluate(() => window.__test.calls.filter((entry) => entry.type === 'update:install').length)).toBe(0);
  await page.getByRole('button', { name: 'Redémarrer et installer', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Installation de la mise à jour et redémarrage…');
  expect(await page.evaluate(() => window.__test.calls.filter((entry) => entry.type === 'update:install').length)).toBe(1);
});

test('a ready update waits for the running media job before enabling restart', async ({ page }) => {
  await selectFile(page);
  await page.getByRole('button', { name: 'Convertir en MP4', exact: true }).click();
  await page.evaluate(() => window.__test.setUpdate({ status: 'downloaded', version: '5.0.1', percent: 100 }));
  await page.getByRole('button', { name: 'Voir la mise à jour' }).click();
  await expect(page.getByRole('button', { name: 'Redémarrer et installer', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog')).toContainText('Attendez la fin du traitement avant de redémarrer.');
  await page.evaluate(() => window.__test.finish());
  await expect(page.getByRole('button', { name: 'Redémarrer et installer', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.__test.calls.filter((entry) => entry.type === 'update:install').length)).toBe(0);
});

test('portable updates open GitHub and fit a narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__test.setUpdate({ mode: 'manual', status: 'available', version: '5.0.1' }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Voir la mise à jour' }).click();
  await expect(page.getByRole('button', { name: 'Télécharger la mise à jour', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Télécharger sur GitHub', exact: true }).click();
  expect(await page.evaluate(() => window.__test.calls.filter((entry) => entry.type === 'update:openRelease').length)).toBe(1);
  expect(await page.evaluate(() => window.__test.calls.filter((entry) => entry.type === 'update:download').length)).toBe(0);
});

test('an offline check can be retried without losing the selected media', async ({ page }) => {
  await selectFile(page);
  await page.evaluate(() => { window.__test.updateCheckError = true; });
  await page.getByRole('button', { name: 'À propos', exact: true }).click();
  await page.getByRole('button', { name: 'Vérifier les mises à jour', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Vérifiez votre connexion');
  await page.evaluate(() => { window.__test.updateCheckError = false; });
  await page.getByRole('button', { name: 'Vérifier les mises à jour', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('La version 5.0.1 est disponible.');
  await page.keyboard.press('Escape');
  await expect(page.getByText('Vacances en Bretagne.mov', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Convertir en MP4', exact: true })).toBeEnabled();
});
