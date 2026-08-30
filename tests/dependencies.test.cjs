const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { resolveFfmpegPath } = require('../electron/services/dependencies.cjs');

test('uses the packaged Windows FFmpeg binary on Windows', () => {
  const resolved = resolveFfmpegPath({
    isPackaged: true,
    platform: 'win32',
    resourcesPath: path.join('C:', 'Program Files', 'YouTube Downloader', 'resources'),
    staticBinary: '/mac/ffmpeg'
  });

  assert.equal(resolved, path.join('C:', 'Program Files', 'YouTube Downloader', 'resources', 'ffmpeg', 'ffmpeg.exe'));
});

test('rewrites the ffmpeg-static path when it is unpacked from an asar archive', () => {
  const resolved = resolveFfmpegPath({
    isPackaged: true,
    platform: 'darwin',
    resourcesPath: '/Applications/Test.app/Contents/Resources',
    staticBinary: '/Applications/Test.app/Contents/Resources/app.asar/node_modules/ffmpeg-static/ffmpeg'
  });

  assert.equal(
    resolved,
    '/Applications/Test.app/Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg'
  );
});
