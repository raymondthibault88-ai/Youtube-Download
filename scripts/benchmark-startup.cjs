/* global document, window */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright');

const projectRoot = path.resolve(__dirname, '..');
const appRoot = path.resolve(process.env.V5_STARTUP_APP_DIR || projectRoot);
const directory = path.resolve(process.env.V5_STARTUP_DIR || 'test-results/startup');
const repetitions = Number(process.env.V5_STARTUP_REPETITIONS || 5);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const round = (value) => Math.round(value * 100) / 100;

async function main() {
  // Install/resolve the development runtime before starting any launch timer.
  const executablePath = require('electron');
  assert.ok(fs.existsSync(executablePath), 'Install the Electron runtime first.');
  assert.ok(Number.isInteger(repetitions) && repetitions >= 3 && repetitions <= 10);
  assert.ok(fs.existsSync(path.join(appRoot, 'dist/index.html')), 'Build the renderer first.');
  const profile = path.join(directory, `profile-${Date.now()}`);
  const bin = path.join(profile, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  assert.ok(
    process.env.V5_YTDLP_PATH && fs.existsSync(process.env.V5_YTDLP_PATH),
    'Provide a verified cached yt-dlp binary.'
  );
  const binaryName =
    process.platform === 'win32'
      ? 'yt-dlp.exe'
      : process.platform === 'darwin'
        ? 'yt-dlp_macos'
        : 'yt-dlp';
  fs.copyFileSync(process.env.V5_YTDLP_PATH, path.join(bin, binaryName));
  if (process.platform !== 'win32') fs.chmodSync(path.join(bin, binaryName), 0o755);
  const env = { ...process.env, NODE_PATH: path.join(projectRoot, 'node_modules') };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;
  const report = {
    at: new Date().toISOString(),
    version: require(path.join(appRoot, 'package.json')).version,
    electronPackage: require('electron/package.json').version,
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    totalMemoryGiB: round(os.totalmem() / 1024 ** 3),
    platform: process.platform,
    methodology:
      'Instrumented Electron source application, one fresh profile followed by repeated launches of that profile; tools already cached and SHA256 checked by the app. Not a cold OS cache or an installer benchmark. Timings include the same Playwright launch overhead on both sides.',
    assets: fs
      .readdirSync(path.join(appRoot, 'dist/assets'))
      .map((name) => ({ name, bytes: fs.statSync(path.join(appRoot, 'dist/assets', name)).size })),
    runs: []
  };
  for (let index = 0; index < repetitions; index++) {
    const started = performance.now();
    const app = await _electron.launch({
      executablePath,
      args: [`--user-data-dir=${profile}`, appRoot],
      cwd: appRoot,
      env,
      timeout: 60000
    });
    app
      .process()
      .stderr?.on('data', (data) =>
        fs.appendFileSync(path.join(directory, 'electron-stderr.log'), data)
      );
    try {
      const launchMs = performance.now() - started;
      const page = await app.firstWindow();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.getByRole('heading', { name: 'YouTube Downloader', exact: true }).waitFor();
      await page.waitForFunction(() => document.body.classList.contains('app-ready'));
      await page.locator('#splash').waitFor({ state: 'detached' });
      await page.getByLabel('Lien YouTube', { exact: true }).waitFor();
      const interactiveMs = performance.now() - started;
      await page.evaluate(() => document.fonts.ready);
      const fontsReadyMs = performance.now() - started;
      const dependencyInfo = await page.evaluate(() => window.desktopAPI.checkDependencies());
      const toolsReadyMs = performance.now() - started;
      const ipc = [];
      for (let call = 0; call < 10; call++) {
        const tick = performance.now();
        await page.evaluate(() => window.desktopAPI.getStartupInfo());
        ipc.push(performance.now() - tick);
      }
      const renderer = await page.evaluate(() => ({
        domContentLoadedMs: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd,
        paints: performance
          .getEntriesByType('paint')
          .map((entry) => ({ name: entry.name, milliseconds: entry.startTime }))
      }));
      const metrics = await app.evaluate(({ app }) => ({
        versions: process.versions,
        processes: app.getAppMetrics().map((metric) => ({
          type: metric.type,
          workingSetKiB: metric.memory.workingSetSize,
          privateKiB: metric.memory.privateBytes || 0
        }))
      }));
      assert.deepEqual(errors, []);
      const result = {
        profile: index === 0 ? 'fresh' : 'reused',
        timingsMs: {
          launch: round(launchMs),
          interactive: round(interactiveMs),
          fontsReady: round(fontsReadyMs),
          toolsReady: round(toolsReadyMs),
          ipcMedian: round(median(ipc))
        },
        dependencies: { ytDlp: dependencyInfo.ytDlpVersion, ffmpeg: dependencyInfo.ffmpegVersion },
        renderer,
        processes: metrics.processes,
        totalPrivateMiB: round(
          metrics.processes.reduce((total, process) => total + process.privateKiB, 0) / 1024
        )
      };
      report.runtime = metrics.versions;
      report.runs.push(result);
      console.log(
        JSON.stringify({ run: index + 1, ...result.timingsMs, privateMiB: result.totalPrivateMiB })
      );
    } finally {
      await app.close();
    }
  }
  const warm = report.runs.slice(1);
  report.reusedProfileMedian = Object.fromEntries(
    Object.keys(warm[0].timingsMs).map((key) => [
      key,
      round(median(warm.map((run) => run.timingsMs[key])))
    ])
  );
  report.reusedPrivateMiBMedian = round(median(warm.map((run) => run.totalPrivateMiB)));
  fs.writeFileSync(path.join(directory, 'startup-benchmark.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      medians: report.reusedProfileMedian,
      privateMiB: report.reusedPrivateMiBMedian
    })
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
