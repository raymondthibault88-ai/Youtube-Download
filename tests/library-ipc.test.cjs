const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const { validateBatchPayload } = require('../electron/ipc/register-library-handlers.cjs');

test('the batch IPC rejects bad paths, shapes, qualities, untrusted URLs and injected format arguments', () => {
  const valid = {
    outputDir: os.tmpdir(),
    items: [{ url: 'https://youtu.be/BaW_jenozKc', title: 'Vidéo é', formatId: '137' }],
    targetHeight: 1080
  };
  assert.equal(validateBatchPayload(valid).targetHeight, 1080);
  assert.equal(validateBatchPayload(valid).items[0].formatId, '137');
  for (const payload of [
    null,
    {},
    { ...valid, items: [] },
    { ...valid, items: Array(501).fill(valid.items[0]) },
    { ...valid, targetHeight: 123 },
    { ...valid, outputDir: 'relative' },
    { ...valid, items: [{ url: 'https://youtube.com.evil.invalid/watch?v=abc' }] },
    { ...valid, items: [{ url: valid.items[0].url, formatId: '--exec calc' }] }
  ]) {
    assert.throws(() => validateBatchPayload(payload));
  }
});
