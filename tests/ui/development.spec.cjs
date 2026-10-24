const { test, expect } = require('@playwright/test');

let server;
let devUrl;

test.beforeAll(async () => {
  const { createServer } = await import('vite');
  server = await createServer({
    server: { host: '127.0.0.1', port: 0, strictPort: false },
    logLevel: 'error'
  });
  await server.listen();
  devUrl = server.resolvedUrls.local[0];
});

test.afterAll(async () => {
  await server?.close();
});

test('development loads global styles, CSS modules and fonts under the content security policy', async ({
  page
}, testInfo) => {
  const errors = [];
  const messages = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => messages.push(message.text()));
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push({
        directive: event.effectiveDirective,
        blocked: event.blockedURI
      });
    });
    window.desktopAPI = {
      getStartupInfo: async () => ({ downloadsPath: 'C:\\Videos' }),
      checkDependencies: async () => ({
        downloadsPath: 'C:\\Videos',
        ytDlpVersion: 'test',
        ffmpegVersion: 'test'
      }),
      getCurrentJob: async () => null,
      getUpdateState: async () => ({
        mode: 'disabled',
        status: 'disabled',
        currentVersion: '5.0.0',
        version: null,
        percent: 0,
        error: null,
        checkedAt: null
      }),
      onUpdateState: () => () => {},
      onJobUpdate: () => () => {},
      getYouTubeAccount: async () => ({
        configured: false,
        connected: false,
        connecting: false,
        channel: null,
        error: null
      }),
      onYouTubeAccount: () => () => {}
    };
  });
  await page.goto(devUrl);
  await expect(
    page.getByRole('heading', { name: 'YouTube Downloader', exact: true })
  ).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/app-ready/);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.app-header')).toHaveCSS('display', 'flex');
  await expect(page.locator('.workspace:visible')).toHaveCSS('display', 'grid');
  await expect(page.locator('.output-card:visible')).toHaveCSS('position', 'fixed');
  await expect(page.locator('.brand-name')).toHaveCSS('font-size', '16px');
  await expect(page.locator('body')).toHaveCSS('font-family', /"Manrope Variable"/);
  await expect
    .poll(() =>
      page.evaluate(() => document.fonts.check('14px "Manrope Variable"', 'YouTube Télécharger'))
    )
    .toBe(true);
  await expect
    .poll(() => messages.some((message) => message.includes('[vite] connected.')))
    .toBe(true);
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
  expect(errors).toEqual([]);
  const styles = await page
    .locator('style[data-vite-dev-id]')
    .evaluateAll((elements) =>
      elements.map((element) => ({ id: element.dataset.viteDevId, nonce: element.nonce }))
    );
  expect(styles.length).toBeGreaterThanOrEqual(3);
  expect(styles.every((style) => Boolean(style.nonce))).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('v5-development.png'),
    fullPage: true,
    animations: 'disabled'
  });
});
