const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:5173', headless: true, screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev:renderer -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: false }
});
