const fs = require('node:fs');
const { defineConfig } = require('@playwright/test');

const localChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
module.exports = defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: [['list']],
  use: {
    viewport: { width: 1200, height: 760 },
    reducedMotion: 'reduce',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (!process.env.CI && fs.existsSync(localChrome) ? localChrome : undefined) },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  }
});
