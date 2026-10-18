/* global window, document, getComputedStyle */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const nodeCrypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { _electron } = require('playwright');
const { buildDownloadArgs } = require('../electron/services/youtube.cjs');

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const artifactDir = path.resolve(process.env.V5_ARTIFACT_DIR || path.join(projectRoot, 'test-results', 'desktop'));
  const fixtureDir = path.join(artifactDir, 'native-smoke');
  const outputDir = path.join(fixtureDir, 'exports');
  fs.mkdirSync(outputDir, { recursive: true });
  const inputPath = path.join(fixtureDir, 'Vidéo originale é.mov');
  const ffmpeg = require('ffmpeg-static');
  assert.ok(fs.existsSync(ffmpeg), 'FFmpeg absent : réinstaller les dépendances sans --ignore-scripts.');
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', inputPath], { windowsHide: true });
  const hash = (filePath) => nodeCrypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  const originalHash = hash(inputPath);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const userDataDir = process.env.V5_TEST_USER_DATA_DIR && path.resolve(process.env.V5_TEST_USER_DATA_DIR);
  const args = [...(userDataDir ? [`--user-data-dir=${userDataDir}`] : []), ...(process.env.V5_EXECUTABLE ? [] : [projectRoot])];
  const electronApp = await _electron.launch({ executablePath: process.env.V5_EXECUTABLE || require('electron'), args, cwd: projectRoot, env });
  let page;
  let storageBefore;
  try {
    if (userDataDir) assert.equal(path.resolve(await electronApp.evaluate(({ app }) => app.getPath('userData'))), userDataDir, 'Le test doit utiliser son dossier de données isolé.');
    page = await electronApp.firstWindow();
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.app-header')).display === 'flex');
    await page.evaluate(() => document.fonts.ready);
    const rendererStyles = await page.evaluate(() => ({
      header: getComputedStyle(document.querySelector('.app-header')).display,
      workspace: getComputedStyle(document.querySelector('.workspace')).display,
      font: getComputedStyle(document.body).fontFamily,
      fontLoaded: document.fonts.check('14px "Manrope Variable"', 'YouTube Télécharger')
    }));
    assert.equal(rendererStyles.header, 'flex');
    assert.equal(rendererStyles.workspace, 'grid');
    assert.match(rendererStyles.font, /"Manrope Variable"/);
    assert.equal(rendererStyles.fontLoaded, true);
    await page.screenshot({ path: path.join(artifactDir, 'v5-00-electron-accueil.png'), fullPage: false });
    storageBefore = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    const startup = await page.evaluate(() => window.desktopAPI.getStartupInfo());
    assert.ok(startup.downloadsPath, 'Le bridge IPC file: doit accepter le renderer Windows.');
    const updates = await page.evaluate(() => window.desktopAPI.getUpdateState());
    assert.equal(updates.currentVersion, require('../package.json').version);
    if (!process.env.V5_EXECUTABLE) {
      assert.equal(updates.status, 'disabled', 'Le mode développement ne doit pas rechercher de mise à jour.');
      assert.equal((await page.evaluate(() => window.desktopAPI.checkForUpdates())).status, 'disabled');
    }
    const canReadClipboard = await page.evaluate(async () => typeof await window.desktopAPI.readClipboard() === 'string');
    assert.equal(canReadClipboard, true);
    // Exercise the real download arguments without a network request. Windows
    // otherwise emits ANSI filenames that Node's UTF-8 decoder cannot preserve.
    const dependencies = await page.evaluate(() => window.desktopAPI.checkDependencies());
    const infoPath = path.join(fixtureDir, 'unicode-download.json');
    const expectedFilename = path.join(fixtureDir, 'Été à Dijon.mov');
    fs.writeFileSync(infoPath, JSON.stringify({ id: 'encoding-check', title: 'Été à Dijon', extractor: 'generic', extractor_key: 'Generic', webpage_url: 'https://example.invalid/video', url: 'https://example.invalid/video.mov', ext: 'mov', format_id: '22', protocol: 'https', vcodec: 'avc1', acodec: 'mp4a', width: 1280, height: 720, duration: 2 }));
    const downloadArgs = buildDownloadArgs({ ffmpegPath: dependencies.ffmpegPath, formatSelector: '22', outputDir: fixtureDir, url: 'https://youtu.be/offline-test', shouldRecodeToMp4: false });
    downloadArgs.pop(); // Stored metadata replaces the URL in this offline test.
    const printedFilename = execFileSync(dependencies.ytDlpPath, ['--ignore-config', ...downloadArgs, '--load-info-json', infoPath, '--skip-download', '--print', 'filename'], { windowsHide: true, encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    assert.equal(path.normalize(printedFilename), expectedFilename);
    fs.copyFileSync(inputPath, expectedFilename);
    assert.ok(fs.existsSync(printedFilename), 'Le chemin accentué émis par yt-dlp doit désigner le fichier réel.');
    await electronApp.evaluate(({ dialog, shell }, locations) => {
      globalThis.smokeInputPath = locations.inputPath;
      dialog.showOpenDialog = async (options) => ({ canceled: false, filePaths: [options.properties.includes('openDirectory') ? locations.outputDir : globalThis.smokeInputPath] });
      globalThis.smokeRevealedPath = null;
      shell.showItemInFolder = (targetPath) => { globalThis.smokeRevealedPath = targetPath; };
    }, { inputPath, outputDir });
    await page.getByRole('tab', { name: 'Convertir / compresser' }).click();
    await page.getByRole('button', { name: 'Choisir une vidéo' }).click();
    await page.getByText('Vidéo originale é.mov', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Changer le dossier de sortie :', exact: false }).click();
    await page.getByRole('radio', { name: '480p', exact: true }).click();
    await page.getByRole('radio', { name: 'Compresser', exact: true }).click();
    await page.getByRole('radio', { name: /Forte/ }).click();
    await page.getByRole('button', { name: 'Compresser la vidéo' }).click();
    await page.getByRole('heading', { name: 'Fichier enregistré' }).waitFor({ timeout: 60000 });
    const job = await page.evaluate(() => window.desktopAPI.getCurrentJob());
    assert.equal(job.state, 'completed');
    assert.match(path.basename(job.result.outputPath), /^Vidéo originale é(?: \(\d+\))?\.mp4$/);
    assert.equal(hash(inputPath), originalHash, 'La source doit rester inchangée.');
    assert.equal(path.dirname(job.result.outputPath), outputDir);
    assert.ok(fs.statSync(job.result.outputPath).size > 0);
    const probe = execFileSync(ffmpeg, ['-hide_banner', '-i', job.result.outputPath, '-f', 'null', '-'], { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const { MediaService } = require('../electron/services/media.cjs');
    const metadata = await new MediaService(ffmpeg).inspect(job.result.outputPath);
    assert.equal(metadata.height, 480);
    // Exercise the default profile too: this includes the real hardware probe.
    await page.getByRole('radio', { name: 'Convertir en MP4', exact: true }).click();
    await page.getByRole('button', { name: 'Convertir en MP4' }).click();
    await page.getByRole('heading', { name: 'Fichier enregistré' }).waitFor({ timeout: 60000 });
    const fastJob = await page.evaluate(() => window.desktopAPI.getCurrentJob());
    assert.equal(fastJob.state, 'completed');
    assert.notEqual(fastJob.result.outputPath, job.result.outputPath, 'Le deuxième export ne doit pas remplacer le premier.');
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', fastJob.result.outputPath, '-f', 'null', '-'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(hash(inputPath), originalHash);
    await page.getByRole('button', { name: 'Afficher le fichier', exact: true }).click();
    assert.equal(await electronApp.evaluate(() => globalThis.smokeRevealedPath), fastJob.result.outputPath);
    const largeConversions = [];
    if (process.env.V5_LARGE_FIXTURES_DIR) {
      for (const [filename, expectedHeight] of [['Mouvement 1080p é.mp4', 1080], ['Mouvement 4K é.mp4', 2160]]) {
        const sourcePath = path.resolve(process.env.V5_LARGE_FIXTURES_DIR, filename);
        const sourceHash = hash(sourcePath);
        await electronApp.evaluate((_electron, selectedPath) => { globalThis.smokeInputPath = selectedPath; }, sourcePath);
        await page.getByRole('button', { name: 'Changer', exact: true }).click();
        await page.getByRole('heading', { name: filename, exact: true }).waitFor();
        await page.getByRole('radio', { name: `Conserver la définition, ${expectedHeight}p`, exact: true }).click();
        const previous = await page.evaluate(() => window.desktopAPI.getCurrentJob());
        const started = performance.now();
        await page.getByRole('button', { name: 'Convertir en MP4' }).click();
        // waitForFunction's page predicate is synchronous. Await IPC on the
        // Node side so a Promise cannot be mistaken for a completed job.
        let current;
        while (performance.now() - started < 120000) {
          const snapshot = await page.evaluate(() => window.desktopAPI.getCurrentJob());
          if (snapshot && snapshot.id !== previous?.id && !['running', 'cancelling'].includes(snapshot.state)) {
            const name = snapshot.result?.outputPath?.split(/[\\/]/).pop().replace(/ \(\d+\)(?=\.mp4$)/, '');
            if (snapshot.state !== 'completed' || name === filename) {
              current = snapshot;
              break;
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
        assert.ok(current, `Conversion native ${filename} : délai dépassé.`);
        assert.equal(current.state, 'completed', current.error || 'La conversion native doit réussir.');
        const elapsedSeconds = (performance.now() - started) / 1000;
        const info = await new MediaService(ffmpeg).inspect(current.result.outputPath);
        assert.equal(info.height, expectedHeight);
        assert.equal(info.codec, 'h264');
        assert.equal(info.pixelFormat, 'yuv420p');
        assert.equal(path.basename(current.result.outputPath).replace(/ \(\d+\)(?=\.mp4$)/, ''), filename);
        execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-xerror', '-i', current.result.outputPath, '-f', 'null', '-'], { windowsHide: true, timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
        assert.equal(hash(sourcePath), sourceHash);
        largeConversions.push({ sourcePath, outputPath: current.result.outputPath, height: info.height, duration: info.duration, elapsedSeconds, decodingSucceeded: true, originalPreserved: true });
      }
    }
    await page.screenshot({ path: path.join(artifactDir, 'v5-06-electron-conversion-reelle.png'), fullPage: false, animations: 'disabled' });
    let liveDownload;
    if (process.env.V5_YOUTUBE_SMOKE_URL) {
      const url = process.env.V5_YOUTUBE_SMOKE_URL;
      const info = await page.evaluate(url => window.desktopAPI.analyzeVideo(url), url);
      const format = info.formats.find(format => format.id === '299') || info.formats.find(format => format.resolution.includes('1080') && format.quickTimeCompatible && format.ext === 'mp4');
      assert.ok(format?.quickTimeCompatible, 'Le test réseau natif exige une source 1080p H.264 compatible.');
      const result = await page.evaluate(payload => window.desktopAPI.startDownload(payload), { url, outputDir, formatId: format.id, hasVideo: true, hasAudio: format.hasAudio, mergeAudioIfNeeded: !format.hasAudio, shouldRecodeToMp4: false });
      const job = await page.evaluate(() => window.desktopAPI.getCurrentJob());
      assert.equal(job.state, 'completed');
      assert.equal(job.type, 'download');
      assert.equal(path.basename(result.outputPath).replace(/ \(\d+\)(?=\.mp4$)/, ''), `${info.title}.mp4`);
      const metadata = await new MediaService(ffmpeg).inspect(result.outputPath);
      assert.equal(metadata.height, 1080);
      assert.equal(metadata.codec, 'h264');
      assert.equal(metadata.audioCodec, 'aac');
      const streams = execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', result.outputPath, '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy', '-f', 'streamhash', '-hash', 'sha256', '-'], { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      liveDownload = { url, formatId: format.id, fps: format.fps, outputPath: result.outputPath, height: metadata.height, duration: metadata.duration, bytes: fs.statSync(result.outputPath).size, streamHashes: streams.trim(), realPackagedIpc: Boolean(process.env.V5_EXECUTABLE) };
    }
    const report = { version: require('../package.json').version, rendererProtocol: new URL(page.url()).protocol, rendererStyles, ipcFileProtocol: page.url().startsWith('file:'), clipboardBridge: true, unicodeDownloadFilename: true, revealFileIpc: true, conversion: { outputPath: job.result.outputPath, height: metadata.height, duration: metadata.duration, outputBytes: job.result.outputSize }, defaultProfile: { outputPath: fastJob.result.outputPath, outputBytes: fastJob.result.outputSize, decodingSucceeded: true }, largeConversions, liveDownload, originalPreserved: true, decodingSucceeded: typeof probe === 'string' };
    fs.writeFileSync(path.join(artifactDir, 'desktop-smoke.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (page && storageBefore) await page.evaluate((values) => {
      localStorage.clear();
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
    }, storageBefore).catch(() => {});
    await electronApp.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
