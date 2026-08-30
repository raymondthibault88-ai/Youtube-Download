const test = require('node:test');
const assert = require('node:assert/strict');
const { validateFormatId, validateYouTubeUrl } = require('../electron/services/validation.cjs');

test('YouTube URL validation rejects untrusted origins', () => {
  assert.match(validateYouTubeUrl('https://youtu.be/abc'), /^https:\/\/youtu\.be/);
  assert.throws(() => validateYouTubeUrl('https://youtube.com.attacker.example/watch?v=x'));
  assert.throws(() => validateYouTubeUrl('http://youtube.com/watch?v=x'));
});

test('format ids cannot inject yt-dlp arguments', () => {
  assert.equal(validateFormatId('137-drc'), '137-drc');
  assert.throws(() => validateFormatId('--exec calc'));
});
