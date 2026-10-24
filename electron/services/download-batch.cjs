const { allowedHosts } = require('../../shared/youtube-config.json');
const { createAbortError } = require('./process-runner.cjs');
const { requireAbsolutePath, validateFormatId } = require('./validation.cjs');

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const { maxBatchItems: MAX_BATCH_ITEMS } = require('../../shared/library-config.json');

function normalizeBatchItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > MAX_BATCH_ITEMS) {
    throw new Error(`Sélectionnez entre 1 et ${MAX_BATCH_ITEMS} vidéos.`);
  }
  const seen = new Set();
  return items.flatMap((item) => {
    let parsed;
    try {
      parsed = new URL(String(item?.url || ''));
    } catch {
      throw new Error('Le lien d’une des vidéos est invalide.');
    }
    if (
      parsed.protocol !== 'https:' ||
      !allowedHosts.includes(parsed.hostname) ||
      parsed.username ||
      parsed.password ||
      parsed.port
    ) {
      throw new Error('Le lot doit contenir uniquement des vidéos YouTube.');
    }
    const parts = parsed.pathname.split('/').filter(Boolean);
    const id = parsed.hostname.endsWith('youtu.be')
      ? parts[0]
      : parts[0] === 'watch'
        ? parsed.searchParams.get('v')
        : ['shorts', 'live', 'embed'].includes(parts[0])
          ? parts[1]
          : null;
    if (!VIDEO_ID.test(id || '')) throw new Error('Le lien d’une des vidéos est invalide.');
    if (seen.has(id)) return [];
    seen.add(id);
    return [
      {
        id,
        url: `https://www.youtube.com/watch?v=${id}`,
        title: String(item.title || 'Vidéo YouTube')
          .trim()
          .slice(0, 500),
        ...(item.formatId == null ? {} : { formatId: validateFormatId(item.formatId) })
      }
    ];
  });
}

function formatHeight(format) {
  const height = Number(format.height);
  if (Number.isFinite(height) && height > 0) return height;
  const resolution = String(format.resolution || '').replace(/\s/g, '');
  const match = resolution.match(/(?:^|[x×])(\d{2,5})(?:p(?:\d+(?:\.\d+)?)?)?$/i);
  if (match) return Number(match[1]);
  if (/^4k$/i.test(resolution)) return 2160;
  if (/^8k$/i.test(resolution)) return 4320;
  return 0;
}

function selectBatchFormat(formats, { formatId, targetHeight = null } = {}) {
  if (!Array.isArray(formats) || !formats.length) {
    throw new Error('Aucune qualité vidéo disponible pour ce lien.');
  }
  if (formatId != null) {
    const selected = formats.find((format) => format.id === formatId);
    if (!selected) throw new Error('Le format choisi n’est plus disponible pour cette vidéo.');
    return selected;
  }
  if (targetHeight == null) {
    return formats.find((format) => format.quickTimeCompatible) || formats[0];
  }
  const eligible = formats.filter((format) => {
    const height = formatHeight(format);
    return height > 0 && height <= targetHeight;
  });
  if (!eligible.length) {
    throw new Error(`Aucun format de ${targetHeight}p ou inférieur n’est disponible.`);
  }
  const height = Math.max(...eligible.map(formatHeight));
  const matching = eligible.filter((format) => formatHeight(format) === height);
  return matching.find((format) => format.quickTimeCompatible) || matching[0];
}

async function runDownloadBatch({
  items,
  outputDir,
  targetHeight = null,
  youtube,
  signal,
  onProgress,
  onItem
}) {
  const selected = normalizeBatchItems(items);
  const destination = requireAbsolutePath(outputDir, 'Dossier de sortie');
  if (
    targetHeight !== null &&
    (!Number.isInteger(targetHeight) || targetHeight <= 0 || targetHeight > 8640)
  ) {
    throw new Error('Définition du lot invalide.');
  }
  const results = selected.map(({ id, url, title }) => ({ id, url, title, state: 'pending' }));
  let lastPercent = 0;
  const summary = () => {
    const completed = results.filter((item) => item.state === 'completed').length;
    const failed = results.filter((item) => item.state === 'failed').length;
    const cancelled = results.filter((item) => item.state === 'cancelled').length;
    const outputPath = results.findLast((item) => item.state === 'completed')?.outputPath;
    return {
      ok: failed === 0 && cancelled === 0,
      items: results.map((item) => ({ ...item })),
      completed,
      failed,
      cancelled,
      total: results.length,
      ...(outputPath ? { outputPath } : {})
    };
  };
  const report = (progress, index) => {
    const itemPercent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
    lastPercent = Math.max(
      lastPercent,
      Math.min(99, Math.round(((index + itemPercent / 100) / results.length) * 100))
    );
    const counters = summary();
    onProgress?.({
      ...progress,
      percent: lastPercent,
      batch: {
        total: results.length,
        index: index + 1,
        completed: counters.completed,
        failed: counters.failed,
        currentTitle: results[index].title
      }
    });
  };
  const abort = (index) => {
    for (let next = index; next < results.length; next += 1) {
      results[next] = { ...results[next], state: 'cancelled' };
      onItem?.({ ...results[next] });
    }
    const error = createAbortError();
    error.partialResult = { ...summary(), ok: false };
    throw error;
  };

  for (let index = 0; index < selected.length; index += 1) {
    if (signal?.aborted) abort(index);
    const item = selected[index];
    report(
      { percent: 0, stage: 'prepare', speed: null, eta: null, raw: 'Analyse de la vidéo…' },
      index
    );
    try {
      const analysis = await youtube.analyze(item.url, signal);
      if (signal?.aborted) throw createAbortError();
      if (analysis.title) results[index].title = String(analysis.title).trim().slice(0, 500);
      const format = selectBatchFormat(analysis.formats, { formatId: item.formatId, targetHeight });
      const result = await youtube.download(
        {
          url: item.url,
          outputDir: destination,
          formatId: format.id,
          mergeAudioIfNeeded: format.hasVideo && !format.hasAudio,
          hasVideo: format.hasVideo,
          hasAudio: format.hasAudio,
          shouldRecodeToMp4: format.ext?.toLowerCase() !== 'mp4' || !format.quickTimeCompatible
        },
        signal,
        (progress) => report(progress, index)
      );
      results[index] = { ...results[index], state: 'completed', outputPath: result.outputPath };
      onItem?.({ ...results[index] });
      report(
        { percent: 100, stage: 'finalize', speed: null, eta: null, raw: 'Vidéo enregistrée.' },
        index
      );
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') abort(index);
      results[index] = {
        ...results[index],
        state: 'failed',
        error: String(error?.message || 'Le téléchargement n’a pas pu aboutir.')
      };
      onItem?.({ ...results[index] });
      report(
        {
          percent: 100,
          stage: 'prepare',
          speed: null,
          eta: null,
          raw: 'Vidéo ignorée après une erreur.'
        },
        index
      );
    }
  }
  return summary();
}

module.exports = { normalizeBatchItems, selectBatchFormat, runDownloadBatch };
