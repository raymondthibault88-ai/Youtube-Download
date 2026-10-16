/* global window, document, innerWidth */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');
const { expect: baseExpect } = require('@playwright/test');
const expect = baseExpect.configure({ timeout: 30_000 });
const { runProcess } = require('../electron/services/process-runner.cjs');
const { resolveFfmpegPath } = require('../electron/services/dependencies.cjs');

(async () => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'video-studio-electron-'));
  const source = path.join(dir, 'source.mkv');
  const binary = resolveFfmpegPath({ isPackaged: false });
  let application;
  try {
    await runProcess(binary, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=641x361:rate=25', '-t', '0.5', '-c:v', 'ffv1', source]);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.VITE_DEV_SERVER_URL;
    const executablePath = process.env.YTD_TEST_EXECUTABLE ? path.resolve(process.env.YTD_TEST_EXECUTABLE) : undefined;
    const args = [...(executablePath ? [] : [path.resolve(__dirname, '..')]), `--user-data-dir=${path.join(dir, 'profile')}`];
    // Hosted Linux CI has no usable setuid sandbox; production remains sandboxed.
    if (process.platform === 'linux' && process.env.CI) args.push('--no-sandbox');
    application = await electron.launch({ args, env, executablePath, timeout: Number(process.env.YTD_TEST_LAUNCH_TIMEOUT_MS) || 60_000 });
    const page = await application.firstWindow();
    await page.getByRole('heading', { name: 'YouTube Downloader', exact: true }).waitFor();
    const preferences = await application.evaluate(({ BrowserWindow, app }) => ({ preferences: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(), profile: app.getPath('userData') }));
    assert.equal(preferences.profile, path.join(dir, 'profile'));
    assert.equal(preferences.preferences.nodeIntegration, false);
    assert.equal(preferences.preferences.contextIsolation, true);
    assert.equal(preferences.preferences.sandbox, true);
    const zoom = () => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor());
    // Chromium's keyboard automation bypasses Electron's native input hooks.
    const zoomKey = key => application.evaluate(({ BrowserWindow }, keyCode) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      const modifiers = [process.platform === 'darwin' ? 'meta' : 'control'];
      contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
      contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    }, key);
    await zoomKey('=');
    await expect.poll(zoom).toBeGreaterThan(1);
    await zoomKey('0');
    await expect.poll(zoom).toBe(1);
    await zoomKey('-');
    await expect.poll(zoom).toBeLessThan(1);
    await zoomKey('0');
    await expect.poll(zoom).toBe(1);
    await application.evaluate(({ dialog }, paths) => { dialog.showOpenDialog = async options => ({ canceled: false, filePaths: [options.properties.includes('openDirectory') ? paths.dir : paths.source] }); }, { source, dir });
    await page.getByRole('button', { name: 'Convertir', exact: true }).click();
    await page.getByRole('button', { name: 'Sélectionner', exact: true }).click();
    await expect(page.getByText('source.mkv', { exact: true })).toBeVisible();
    const selected = await page.evaluate(() => window.desktopAPI.selectVideoFile());
    assert.equal(selected.width, 641);
    await page.getByRole('button', { name: /Plus léger/ }).click();
    await page.getByRole('button', { name: 'Modifier', exact: true }).click();
    await page.getByRole('button', { name: 'Convertir la vidéo', exact: true }).click();
    // FFmpeg startup and CPU conversion can take longer on emulated/CI hosts.
    await expect(page.getByText('Vidéo prête', { exact: true })).toBeVisible({ timeout: 60_000 });
    const result = (await page.evaluate(() => window.desktopAPI.getCurrentJob())).result;
    assert.ok(result.ok && result.outputSize > 0);
    await runProcess(binary, ['-v', 'error', '-i', result.outputPath, '-f', 'null', '-']);
    const job = await page.evaluate(() => window.desktopAPI.getCurrentJob());
    assert.equal(job.state, 'completed');
    if (process.env.YTD_TEST_SCREENSHOT) await page.screenshot({ path: process.env.YTD_TEST_SCREENSHOT });
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(2));
    await expect.poll(zoom).toBe(2);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (process.env.YTD_TEST_SCREENSHOT) {
      // capturePage preserves native pixel dimensions while Chromium is zoomed.
      const image = await application.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
      await fs.promises.writeFile(`${process.env.YTD_TEST_SCREENSHOT}.zoom-200.png`, Buffer.from(image, 'base64'));
    }
    await zoomKey('0');
    await expect.poll(zoom).toBe(1);
    if (process.env.YTD_TEST_LIVE === '1') {
      const url = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
      const video = await page.evaluate(input => window.desktopAPI.analyzeVideo(input), url);
      const format = video.formats.find(entry => entry.quickTimeCompatible) || video.formats[0];
      const downloaded = await page.evaluate(payload => window.desktopAPI.startDownload(payload), { url, videoId: video.id, formatId: format.id, outputDir: dir });
      assert.ok(downloaded.ok && fs.statSync(downloaded.outputPath).size > 0);
      await runProcess(binary, ['-v', 'error', '-i', downloaded.outputPath, '-f', 'null', '-']);
      console.log('Electron empaqueté : analyse YouTube, téléchargement, fusion et décodage réel OK.');
    }
    if (process.platform === 'darwin') {
      // Hold only the fixture until the new window has observed the active job.
      await application.evaluate(({ app }) => {
        const load = process.getBuiltinModule('module').createRequire(`${app.getAppPath()}/package.json`);
        const services = load('./electron/services/media.cjs');
        const original = services.MediaService.prototype.convert;
        services.MediaService.prototype.convert = async function (payload) {
          await new Promise(resolve => { global.__testReleaseConversion = resolve; });
          return original.call(this, payload);
        };
      });
      const operation = page.evaluate(payload => window.desktopAPI.startConversion(payload), { inputPath: source, outputDir: dir, targetHeight: null, profileId: 'compact' }).catch(() => null);
      await expect.poll(() => page.evaluate(() => window.desktopAPI.getCurrentJob()).then(value => value.state)).toBe('running');
      await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
      await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0);
      const newWindow = application.waitForEvent('window');
      await application.evaluate(({ app }) => app.emit('activate'));
      const reopened = await newWindow;
      await reopened.getByRole('heading', { name: 'YouTube Downloader', exact: true }).waitFor();
      assert.equal((await reopened.evaluate(() => window.desktopAPI.getCurrentJob())).state, 'running');
      await application.evaluate(() => { global.__testReleaseConversion(); delete global.__testReleaseConversion; });
      await expect.poll(() => reopened.evaluate(() => window.desktopAPI.getCurrentJob()).then(value => value.state), { timeout: 60_000 }).toBe('completed');
      await expect(reopened.locator('.job-bar')).toHaveCount(0);
      await expect(reopened.getByText('Vidéo prête', { exact: true })).toBeVisible();
      await expect(reopened.locator('.result-copy')).toContainText('source.mkv');
      await expect(reopened.locator('.result-copy')).toContainText('Plus léger');
      await operation;
      console.log('Electron macOS : fermeture/réouverture pendant une conversion, suivi et fin de tâche OK.');
    }
    const activePage = await application.firstWindow();
    const rejection = await activePage.evaluate(async input => {
      try { await window.desktopAPI.startConversion({ inputPath: input, outputDir: '/tmp', profileId: 'compact' }); return false; }
      catch { return true; }
    }, path.join(dir, 'unselected.mkv'));
    assert.equal(rejection, true);
    const popup = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getURL());
    assert.ok(popup.startsWith('file:'));
    console.log('Electron réel : démarrage, zoom natif, sandbox, preload, IPC, conversion et refus de source non sélectionnée OK.');
  } catch (error) {
    if (application) {
      try {
        const page = await application.firstWindow();
        console.error('État Electron au moment de l’échec :', await page.evaluate(() => window.desktopAPI.getCurrentJob()));
        if (process.env.YTD_TEST_SCREENSHOT) await page.screenshot({ path: `${process.env.YTD_TEST_SCREENSHOT}.failure.png` });
      } catch { /* Preserve the original failure if the application already closed. */ }
    }
    throw error;
  } finally {
    if (application) await application.close();
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
