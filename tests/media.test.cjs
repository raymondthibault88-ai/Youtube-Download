const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOutputOptions, estimateOutputSize, getTargetVideoBitrate, parseFfmpegTime } = require('../electron/services/media.cjs');

const media = { duration: 120, width: 3840, height: 2160, bitrate: 20_000_000 };

test('parseFfmpegTime converts timestamps', () => {
  assert.equal(parseFfmpegTime('01:02:03.5'), 3723.5);
  assert.equal(parseFfmpegTime('invalid'), null);
});

test('output options include all useful lower resolutions and estimates', () => {
  const options = buildOutputOptions(media);
  assert.deepEqual(options.map((option) => option.height), [null, 1440, 1080, 720, 480]);
  assert.ok(options.every((option) => option.estimates.fast > 0));
  assert.ok(options.every((option) => option.estimates.compact < option.estimates.fast));
});

test('compact profile targets a lower bitrate and size', () => {
  assert.ok(getTargetVideoBitrate(1080, media.bitrate, 'compact') < getTargetVideoBitrate(1080, media.bitrate, 'fast'));
  assert.ok(estimateOutputSize(media, 720, 'compact') < estimateOutputSize(media, 720, 'balanced'));
});
