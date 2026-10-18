const { test, expect, analyze } = require('./fixtures.cjs');

test.describe('a pending dependency check', () => {
  test.use({ bridgeOptions: { deferDependencies: true, emptyStartupDirectory: true } });

  test('the first download uses the newly prepared directory without an extra folder dialog', async ({
    page
  }) => {
    await analyze(page);
    await page.getByRole('button', { name: 'Télécharger la vidéo', exact: true }).click();
    expect(
      await page.evaluate(() => window.__test.calls.filter((call) => call.type === 'download'))
    ).toEqual([]);
    await page.evaluate(() => window.__test.completeDependencyCheck());
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__test.calls.find((call) => call.type === 'download')?.payload.outputDir
        )
      )
      .toBe('C:\\Videos\\Mes exports');
    expect(
      await page.evaluate(() =>
        window.__test.calls.filter((call) => call.type === 'selectOutputDir')
      )
    ).toEqual([]);
    await page.evaluate(() => window.__test.finish());
  });
});

test.describe('a pending initial update state', () => {
  test.use({ bridgeOptions: { deferInitialUpdate: true } });

  test('a late initial IPC error cannot override a newer update notification', async ({ page }) => {
    await page.evaluate(() => window.__test.setUpdate({ status: 'available', version: '5.1.1' }));
    await page.getByRole('button', { name: 'Voir la mise à jour' }).click();
    await page.evaluate(() => window.__test.failInitialUpdate());
    await expect(page.getByRole('dialog')).toContainText('La version 5.1.1 est disponible.');
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
  });
});
