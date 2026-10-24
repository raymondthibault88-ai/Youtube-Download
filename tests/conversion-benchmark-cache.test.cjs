const test = require('node:test');
const assert = require('node:assert/strict');
const { qualityCacheKey, frameProofOutputLimit } = require('../scripts/benchmark-conversion.cjs');

const provenance = {
  outputSha256: 'a'.repeat(64),
  sourceSha256: 'b'.repeat(64),
  ffmpegSha256: 'c'.repeat(64),
  model: 'vmaf_4k_v0.6.1',
  targetHeight: null,
  expectedFrames: 874
};

test('quality reuse requires identical complete output, source, metric binary and parameters', () => {
  const key = qualityCacheKey(provenance);
  const cache = new Map([[key, { vmaf: 95, frames: 874 }]]);
  assert.deepEqual(cache.get(qualityCacheKey({ ...provenance })), { vmaf: 95, frames: 874 });
  for (const [field, value] of [
    ['outputSha256', 'd'.repeat(64)],
    ['sourceSha256', 'd'.repeat(64)],
    ['ffmpegSha256', 'd'.repeat(64)],
    ['model', 'vmaf_v0.6.1'],
    ['targetHeight', 1080],
    ['expectedFrames', 875]
  ]) {
    const changed = qualityCacheKey({ ...provenance, [field]: value });
    assert.equal(cache.has(changed), false, `A changed ${field} must invalidate quality reuse`);
  }
});

test('SHA256 case and object property order do not change provenance, malformed evidence is rejected', () => {
  assert.equal(
    qualityCacheKey({ ...provenance, sourceSha256: provenance.sourceSha256.toUpperCase() }),
    qualityCacheKey(Object.fromEntries(Object.entries(provenance).reverse()))
  );
  for (const patch of [
    { outputSha256: 'same decoded pixels' },
    { sourceSha256: '' },
    { ffmpegSha256: 'a'.repeat(63) },
    { model: '' },
    { targetHeight: -1 },
    { expectedFrames: 0 },
    { expectedFrames: Infinity }
  ])
    assert.throws(() => qualityCacheKey({ ...provenance, ...patch }));
});

test('frame proof buffers scale for longer 60fps sources and refuse unbounded allocations', () => {
  assert.equal(frameProofOutputLimit(874), 1024 * 1024);
  const sixMinutesAt60fps = 6 * 60 * 60;
  assert.ok(frameProofOutputLimit(sixMinutesAt60fps) > 1024 * 1024);
  assert.ok(frameProofOutputLimit(sixMinutesAt60fps) > sixMinutesAt60fps * 160);
  for (const invalid of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER])
    assert.throws(() => frameProofOutputLimit(invalid));
});
