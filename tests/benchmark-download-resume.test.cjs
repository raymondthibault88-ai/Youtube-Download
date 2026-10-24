const test = require('node:test');
const assert = require('node:assert/strict');
const {
  median,
  validateResumeCompatibility,
  validateResumeCases
} = require('../scripts/download-benchmark-resume.cjs');

const clone = (value) => JSON.parse(JSON.stringify(value));

test('medians average the middle pair for even repetitions and never mutate the measurements', () => {
  const values = [4, 1, 3, 2];
  assert.equal(median(values), 2.5);
  assert.deepEqual(values, [4, 1, 3, 2]);
  assert.equal(median([7, 1, 3]), 3);
  assert.equal(median([1, 9]), 5);
  assert.equal(median([4]), 4);
  assert.throws(() => median([]), /invalides/);
  assert.throws(() => median([NaN]), /invalides/);
});

function fixture() {
  const expected = {
    environment: { node: 'v24.19.0', platform: 'win32', ytDlpPath: 'new/path/yt-dlp.exe' },
    methodology: {
      repetitions: 3,
      analysisExcludedFromDownloadTimer: true,
      localMetadataLatencyMs: 250,
      localFragmentLatencyMs: 80,
      localPerConnectionLimitMiBps: 25
    },
    comparison: {
      mode: 'current-baseline-versus-updated',
      baselineEngineSha256: 'baseline-entry',
      updatedEngineSha256: 'updated-entry',
      baselineEngineFiles: {
        'youtube.cjs': 'baseline-entry',
        'youtube/formats.cjs': 'baseline-format'
      },
      updatedEngineFiles: {
        'youtube.cjs': 'updated-entry',
        'youtube/formats.cjs': 'updated-format'
      },
      baselineBinarySha256: 'old-yt-dlp',
      updatedBinarySha256: 'new-yt-dlp',
      ffmpegBinarySha256: 'same-ffmpeg',
      fragments: { baseline: 8, optimized: 8 }
    },
    sources: [
      {
        label: '1080p',
        sha256: 'source-sha256',
        height: 1080,
        width: 1920,
        duration: 12,
        streamHashes: 'VIDEO_AND_AUDIO_HASHES'
      }
    ]
  };
  const source = expected.sources[0];
  const quality = (decoded) => ({
    validated: true,
    height: source.height,
    codec: 'h264',
    audioCodec: 'aac',
    duration: 12.04,
    bytes: 10000,
    streamHashes: source.streamHashes,
    compressedStreamsIdentical: true,
    ...(decoded ? { frames: 360 } : {})
  });
  const previous = {
    ...clone(expected),
    passed: true,
    cases: [
      {
        id: '1080p-fragmented',
        trials: Array.from({ length: 3 }, (_, repetition) =>
          ['baseline', 'optimized'].map((variant) => ({
            repetition,
            variant,
            concurrentFragments: 8,
            seconds: 4 + repetition,
            timeToFirstMediaRequest: 1,
            mediaRequests: 13,
            metadataRequestsDuringDownload: 1,
            quality: quality(repetition === 0)
          }))
        ).flat()
      },
      {
        id: '1080p-compatible-container',
        trials: ['baseline', 'optimized'].map((variant) => ({
          variant,
          seconds: 3,
          quality: quality(true)
        }))
      }
    ]
  };
  return { previous, expected };
}

function validate(previous, expected) {
  validateResumeCompatibility(previous, expected);
  validateResumeCases(previous, expected);
}

test('only the same comparison can resume, without modifying reports or requiring identical binary locations', () => {
  const { previous, expected } = fixture();
  previous.environment.ytDlpPath = 'relocated/verified/yt-dlp.exe';
  const original = clone(previous);
  assert.doesNotThrow(() => validate(previous, expected));
  assert.deepEqual(previous, original);
});

test('changed modes, engine modules, binaries, FFmpeg or fragment counts cannot relabel old samples', () => {
  for (const key of [
    'mode',
    'baselineEngineSha256',
    'updatedEngineSha256',
    'baselineBinarySha256',
    'updatedBinarySha256',
    'ffmpegBinarySha256'
  ]) {
    const { previous, expected } = fixture();
    previous.comparison[key] = 'different';
    assert.throws(() => validate(previous, expected), new RegExp(key));
  }
  for (const key of ['baselineEngineFiles', 'updatedEngineFiles']) {
    const { previous, expected } = fixture();
    previous.comparison[key]['youtube/formats.cjs'] = 'changed nested module';
    assert.throws(() => validate(previous, expected), new RegExp(key));
  }
  const { previous, expected } = fixture();
  previous.comparison.fragments.optimized = 4;
  assert.throws(() => validate(previous, expected), /fragments/);
});

test('reports without the new complete provenance fields must be rerun', () => {
  for (const key of ['baselineEngineFiles', 'updatedEngineFiles', 'ffmpegBinarySha256']) {
    const { previous, expected } = fixture();
    delete previous.comparison[key];
    assert.throws(() => validate(previous, expected), new RegExp(key));
  }
});

test('repetitions, all latency controls, runtime and platform must match', () => {
  for (const key of [
    'repetitions',
    'localMetadataLatencyMs',
    'localFragmentLatencyMs',
    'localPerConnectionLimitMiBps'
  ]) {
    const { previous, expected } = fixture();
    previous.methodology[key] += 1;
    assert.throws(() => validate(previous, expected), /méthodologie/);
  }
  for (const key of ['node', 'platform']) {
    const { previous, expected } = fixture();
    previous.environment[key] = 'different';
    assert.throws(() => validate(previous, expected), /environnement/);
  }
});

test('a partial failed run may reuse completed validated cases while unfinished cases are rerun', () => {
  const { previous, expected } = fixture();
  previous.passed = false;
  previous.error = 'Later container trial failed';
  previous.cases = previous.cases.slice(0, 1);
  assert.doesNotThrow(() => validate(previous, expected));
  previous.cases = [];
  assert.doesNotThrow(() => validate(previous, expected));
});

test('each reused case must include every expected variant and exact repetition without duplicates', () => {
  for (const modify of [
    (entry) => entry.trials.pop(),
    (entry) => {
      entry.trials[0].variant = 'cached-4';
    },
    (entry) => {
      entry.trials[0].repetition = 9;
    },
    (entry) => {
      entry.trials[0] = clone(entry.trials[1]);
    },
    (entry) => {
      entry.trials[0].concurrentFragments = 4;
    }
  ]) {
    const { previous, expected } = fixture();
    modify(previous.cases[0]);
    assert.throws(() => validate(previous, expected));
  }
  const { previous, expected } = fixture();
  previous.cases[1].trials[1].variant = 'baseline';
  assert.throws(() => validate(previous, expected), /dupliqué/);
});

test('malformed timings or missing media requests cannot produce a successful resumed benchmark', () => {
  for (const [key, value] of [
    ['seconds', 0],
    ['seconds', NaN],
    ['timeToFirstMediaRequest', 9],
    ['mediaRequests', 0],
    ['metadataRequestsDuringDownload', -1]
  ]) {
    const { previous, expected } = fixture();
    previous.cases[0].trials[0][key] = value;
    assert.throws(() => validate(previous, expected));
  }
});

test('quality must prove dimensions, audio/video codecs, duration, complete decoding and unchanged packets', () => {
  for (const [key, value] of [
    ['validated', false],
    ['height', 2160],
    ['codec', 'av1'],
    ['audioCodec', 'opus'],
    ['duration', 15],
    ['bytes', 0],
    ['streamHashes', 'DIFFERENT_AUDIO'],
    ['compressedStreamsIdentical', false],
    ['frames', 359]
  ]) {
    const { previous, expected } = fixture();
    previous.cases[0].trials[0].quality[key] = value;
    assert.throws(() => validate(previous, expected));
  }
  const { previous, expected } = fixture();
  previous.cases[1].trials[0].quality = { height: 1080 };
  assert.throws(() => validate(previous, expected), /qualité/);
});

test('containers also require the same source fingerprints and cannot reuse unknown or duplicated cases', () => {
  const { previous, expected } = fixture();
  previous.cases = previous.cases.slice(1);
  previous.sources[0].sha256 = 'replaced-source';
  assert.throws(() => validate(previous, expected), /source/);
  const second = fixture();
  second.previous.cases.push(clone(second.previous.cases[0]));
  assert.throws(() => validate(second.previous, second.expected), /dupliqué/);
  const third = fixture();
  third.previous.cases[0].id = 'unknown-fragmented';
  assert.throws(() => validate(third.previous, third.expected), /inconnu/);
});

test('historical reencoding baseline is allowed only with its own full quality validation', () => {
  const { previous, expected } = fixture();
  expected.comparison.mode = 'historical-fragment-comparison';
  expected.comparison.fragments = { baseline: 4, 'cached-4': 4, 'cached-8': 8 };
  previous.comparison = clone(expected.comparison);
  previous.cases = previous.cases.slice(1);
  previous.cases[0].trials[0].quality.compressedStreamsIdentical = false;
  previous.cases[0].trials[0].quality.streamHashes = 'VALIDATED_OLD_ENCODING';
  assert.doesNotThrow(() => validate(previous, expected));
  previous.cases[0].trials[1].quality.compressedStreamsIdentical = false;
  assert.throws(() => validate(previous, expected), /flux/);
});
