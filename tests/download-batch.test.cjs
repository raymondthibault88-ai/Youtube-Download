const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  normalizeBatchItems,
  selectBatchFormat,
  runDownloadBatch
} = require('../electron/services/download-batch.cjs');

const ids = ['abcdefghijk', 'lmnopqrstuv', 'wxyz1234567'];
const items = ids.map((id, index) => ({
  url: `https://www.youtube.com/watch?v=${id}`,
  title: `Vidéo ${index + 1}`
}));
const outputDir = path.resolve('test-results/selected exports é');
const formats = [
  {
    id: '401',
    resolution: '3840x2160',
    ext: 'mp4',
    hasVideo: true,
    hasAudio: false,
    quickTimeCompatible: false
  },
  {
    id: '313',
    resolution: '3840x2160',
    ext: 'webm',
    hasVideo: true,
    hasAudio: false,
    quickTimeCompatible: false
  },
  {
    id: '248',
    resolution: '1920x1080',
    ext: 'webm',
    hasVideo: true,
    hasAudio: false,
    quickTimeCompatible: false
  },
  {
    id: '137',
    resolution: '1920x1080',
    ext: 'mp4',
    hasVideo: true,
    hasAudio: false,
    quickTimeCompatible: true
  },
  {
    id: '22',
    resolution: '1280x720',
    ext: 'mp4',
    hasVideo: true,
    hasAudio: true,
    quickTimeCompatible: true
  },
  {
    id: '135',
    resolution: '480p',
    ext: 'mp4',
    hasVideo: true,
    hasAudio: false,
    quickTimeCompatible: true
  }
];

test('batch URLs are validated, canonicalized and deduplicated before any job starts', () => {
  assert.deepEqual(
    normalizeBatchItems([items[0], { url: 'https://youtu.be/abcdefghijk?t=10' }, items[1]]).map(
      (item) => item.id
    ),
    ids.slice(0, 2)
  );
  for (const candidate of [
    [],
    Array(501).fill(items[0]),
    [{ url: 'https://example.com/watch?v=abcdefghijk' }],
    [{ url: 'https://youtube.com/playlist?list=PLabcdefghijk' }],
    [{ url: 'https://youtube.com/watch?v=bad-id' }],
    [{ ...items[0], formatId: '--exec command' }]
  ]) {
    assert.throws(() => normalizeBatchItems(candidate));
  }
});

test('automatic selection preserves the existing default, explicit formats and resolution ceilings', () => {
  assert.equal(selectBatchFormat(formats).id, '137');
  assert.equal(selectBatchFormat(formats, { targetHeight: 2160 }).id, '401');
  assert.equal(selectBatchFormat(formats, { targetHeight: 1080 }).id, '137');
  assert.equal(selectBatchFormat(formats, { targetHeight: 1440 }).id, '137');
  assert.equal(selectBatchFormat(formats, { targetHeight: 720 }).id, '22');
  assert.equal(selectBatchFormat(formats, { formatId: '313', targetHeight: 720 }).id, '313');
  assert.throws(() => selectBatchFormat(formats, { formatId: 'missing' }), /n’est plus disponible/);
  assert.throws(() => selectBatchFormat([], {}), /Aucune qualité/);
  assert.throws(() => selectBatchFormat(formats, { targetHeight: 360 }), /360p ou inférieur/);
});

test('a batch runs strictly one video at a time and forwards the unchanged default engine payload', async () => {
  const calls = [];
  const progress = [];
  const notifications = [];
  let active = 0;
  const youtube = {
    analyze: async (url) => {
      assert.equal(active, 0);
      calls.push({ type: 'analyze', url });
      active += 1;
      return { title: `Titre ${url.slice(-11)}`, formats };
    },
    download: async (payload, signal, report) => {
      assert.equal(active, 1);
      calls.push({ type: 'download', payload, signal });
      report({ percent: 10, speed: '2 MB/s', eta: '00:05', stage: 'video' });
      report({ percent: 95, speed: null, eta: null, stage: 'finalize' });
      active -= 1;
      return { ok: true, outputPath: path.join(outputDir, payload.url.slice(-11) + '.mp4') };
    }
  };
  const result = await runDownloadBatch({
    items,
    outputDir,
    youtube,
    onProgress: (snapshot) => progress.push(snapshot),
    onItem: (snapshot) => notifications.push(snapshot)
  });
  assert.deepEqual(
    calls.map((call) => call.type),
    ['analyze', 'download', 'analyze', 'download', 'analyze', 'download']
  );
  assert.deepEqual(calls[1].payload, {
    url: items[0].url,
    outputDir,
    formatId: '137',
    mergeAudioIfNeeded: true,
    hasVideo: true,
    hasAudio: false,
    shouldRecodeToMp4: false
  });
  assert.equal(result.ok, true);
  assert.equal(result.completed, 3);
  assert.equal(result.failed, 0);
  assert.equal(result.cancelled, 0);
  assert.equal(result.total, 3);
  assert.equal(notifications.length, 3);
  assert.deepEqual(
    notifications.map((item) => item.state),
    ['completed', 'completed', 'completed']
  );
  assert.equal(result.outputPath, path.join(outputDir, ids[2] + '.mp4'));
  assert.ok(
    progress.every(
      (entry, index) =>
        entry.percent <= 99 && (!index || entry.percent >= progress[index - 1].percent)
    )
  );
  assert.deepEqual(progress[0].batch, {
    total: 3,
    index: 1,
    completed: 0,
    failed: 0,
    currentTitle: 'Vidéo 1'
  });
  assert.equal(progress.at(-1).batch.completed, 3);
  assert.equal(progress.at(-1).batch.index, 3);
});

test('1080p, 4K and individual source formats retain recode and audio merge decisions', async () => {
  for (const [preference, expectedFormat, expectedRecode] of [
    [{ targetHeight: 1080 }, '137', false],
    [{ targetHeight: 2160 }, '401', true],
    [{ formatId: '313' }, '313', true],
    [{ formatId: '22' }, '22', false]
  ]) {
    let payload;
    await runDownloadBatch({
      items: [{ ...items[0], ...(preference.formatId ? { formatId: preference.formatId } : {}) }],
      outputDir,
      targetHeight: preference.targetHeight,
      youtube: {
        analyze: async () => ({ formats }),
        download: async (value) => {
          payload = value;
          return { ok: true, outputPath: '/out.mp4' };
        }
      }
    });
    assert.equal(payload.formatId, expectedFormat);
    assert.equal(payload.shouldRecodeToMp4, expectedRecode);
    assert.equal(payload.mergeAudioIfNeeded, expectedFormat !== '22');
    assert.equal(payload.hasAudio, expectedFormat === '22');
  }
});

test('a failed video does not discard successful files or stop subsequent videos', async () => {
  const calls = [];
  const result = await runDownloadBatch({
    items,
    outputDir,
    youtube: {
      analyze: async (url) => {
        calls.push(url);
        if (url.endsWith(ids[1])) throw new Error('Vidéo supprimée');
        return { formats };
      },
      download: async ({ url }) => ({
        ok: true,
        outputPath: path.join(outputDir, url.slice(-11) + '.mp4')
      })
    }
  });
  assert.deepEqual(
    calls,
    items.map((item) => item.url)
  );
  assert.deepEqual(
    result.items.map((item) => item.state),
    ['completed', 'failed', 'completed']
  );
  assert.equal(result.items[1].error, 'Vidéo supprimée');
  assert.equal(result.ok, false);
  assert.equal(result.completed, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.cancelled, 0);
});

test('a disappeared individually selected format fails only that video instead of changing its quality', async () => {
  let downloads = 0;
  const result = await runDownloadBatch({
    items: [{ ...items[0], formatId: 'absent' }, items[1]],
    outputDir,
    youtube: {
      analyze: async () => ({ formats }),
      download: async () => {
        downloads += 1;
        return { ok: true, outputPath: '/success.mp4' };
      }
    }
  });
  assert.equal(downloads, 1);
  assert.deepEqual(
    result.items.map((item) => item.state),
    ['failed', 'completed']
  );
  assert.match(result.items[0].error, /format choisi/);
});

test('cancellation preserves completed files, marks remaining entries once and starts no later operation', async () => {
  const controller = new AbortController();
  const calls = [];
  const notifications = [];
  const youtube = {
    analyze: async (url) => {
      calls.push(['analyze', url]);
      return { formats };
    },
    download: async ({ url }) => {
      calls.push(['download', url]);
      if (url.endsWith(ids[1])) {
        controller.abort();
        const error = new Error('Arrêt demandé');
        error.name = 'AbortError';
        throw error;
      }
      return { ok: true, outputPath: path.join(outputDir, 'Premier export.mp4') };
    }
  };
  await assert.rejects(
    runDownloadBatch({
      items,
      outputDir,
      youtube,
      signal: controller.signal,
      onItem: (item) => notifications.push(item)
    }),
    (error) => {
      assert.equal(error.name, 'AbortError');
      assert.deepEqual(
        error.partialResult.items.map((item) => item.state),
        ['completed', 'cancelled', 'cancelled']
      );
      assert.equal(error.partialResult.outputPath, path.join(outputDir, 'Premier export.mp4'));
      assert.equal(error.partialResult.completed, 1);
      assert.equal(error.partialResult.cancelled, 2);
      assert.equal(error.partialResult.failed, 0);
      return true;
    }
  );
  assert.equal(calls.length, 4);
  assert.equal(notifications.length, 3);
});

test('cancellation while analyzing and pre-cancellation do not start a download or duplicate item notifications', async () => {
  for (const early of [false, true]) {
    const controller = new AbortController();
    const notifications = [];
    if (early) controller.abort();
    let analyzed = 0;
    let downloaded = 0;
    await assert.rejects(
      runDownloadBatch({
        items,
        outputDir,
        signal: controller.signal,
        onItem: (item) => notifications.push(item),
        youtube: {
          analyze: async () => {
            analyzed += 1;
            controller.abort();
            return { formats };
          },
          download: async () => {
            downloaded += 1;
          }
        }
      }),
      (error) => {
        assert.equal(error.name, 'AbortError');
        assert.equal(error.partialResult.cancelled, 3);
        return true;
      }
    );
    assert.equal(analyzed, early ? 0 : 1);
    assert.equal(downloaded, 0);
    assert.equal(notifications.length, 3);
  }
});
