const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  validateFormatId,
  validateYouTubeUrl,
  validateSender
} = require('../electron/services/validation.cjs');

test('YouTube URL validation rejects untrusted origins', () => {
  assert.match(validateYouTubeUrl('https://youtu.be/abc'), /^https:\/\/youtu\.be/);
  assert.throws(() => validateYouTubeUrl('https://youtube.com.attacker.example/watch?v=x'));
  assert.throws(() => validateYouTubeUrl('http://youtube.com/watch?v=x'));
});

test('packaged renderer is accepted with spaces and accents on the current OS', () => {
  const appPath = path.join(process.cwd(), 'application avec espace é', 'app.asar');
  const frameUrl = pathToFileURL(path.join(appPath, 'dist', 'index.html')).href;
  assert.doesNotThrow(() => validateSender({ senderFrame: { url: frameUrl } }, { appPath }));
});

test('packaged IPC rejects neighboring paths, other documents and subframes', () => {
  const appPath = path.join(process.cwd(), 'app');
  for (const document of [
    path.join(`${appPath}-extra`, 'dist', 'index.html'),
    path.join(appPath, 'other.html'),
    path.join(appPath, 'dist', 'other.html')
  ]) {
    assert.throws(() =>
      validateSender({ senderFrame: { url: pathToFileURL(document).href } }, { appPath })
    );
  }
  assert.throws(() =>
    validateSender(
      {
        senderFrame: {
          url: pathToFileURL(path.join(appPath, 'dist', 'index.html')).href,
          parent: {}
        }
      },
      { appPath }
    )
  );
});

test('development IPC is restricted to the configured origin and main frame', () => {
  const options = { appPath: process.cwd(), devOrigin: 'http://localhost:5173' };
  assert.doesNotThrow(() =>
    validateSender({ senderFrame: { url: 'http://localhost:5173/' } }, options)
  );
  assert.throws(() => validateSender({ senderFrame: { url: 'http://localhost:5174/' } }, options));
  assert.throws(() =>
    validateSender({ senderFrame: { url: 'https://attacker.example/' } }, options)
  );
  assert.throws(() =>
    validateSender({ senderFrame: { url: 'http://localhost:5173/', parent: {} } }, options)
  );
});

test('format ids cannot inject yt-dlp arguments', () => {
  assert.equal(validateFormatId('137-drc'), '137-drc');
  assert.throws(() => validateFormatId('--exec calc'));
});
