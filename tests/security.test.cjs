const test = require('node:test');
const assert = require('node:assert/strict');
const { isPathInside, validateFormatId, validateYouTubeUrl } = require('../electron/services/validation.cjs');

test('YouTube URL validation rejects untrusted origins', () => {
  assert.match(validateYouTubeUrl('https://youtu.be/abc'), /^https:\/\/youtu\.be/);
  assert.throws(() => validateYouTubeUrl('https://youtube.com.attacker.example/watch?v=x'));
  assert.throws(() => validateYouTubeUrl('http://youtube.com/watch?v=x'));
});

test('format ids cannot inject yt-dlp arguments', () => {
  assert.equal(validateFormatId('137-drc'), '137-drc');
  assert.throws(() => validateFormatId('--exec calc'));
});

test('sender path confinement handles Windows file URLs without prefix bypasses', () => {
  const windowsPath = require('node:path').win32;
  assert.equal(isPathInside('C:\\Program Files\\YouTube Downloader\\resources\\app.asar', 'C:\\Program Files\\YouTube Downloader\\resources\\app.asar\\dist\\index.html', windowsPath), true);
  assert.equal(isPathInside('C:\\Program Files\\YouTube Downloader\\resources\\app.asar', 'C:\\Program Files\\YouTube Downloader\\resources\\app.asar.evil\\index.html', windowsPath), false);
});
