const { isDeepStrictEqual } = require('node:util');

function median(values) {
  if (!values.length || values.some((value) => !Number.isFinite(value)))
    throw new Error('Les mesures du benchmark sont absentes ou invalides.');
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function requireMatch(condition, reason) {
  if (!condition) throw new Error(`Reprise du benchmark refusée : ${reason}.`);
}

function validateResumeCompatibility(previous, expected) {
  requireMatch(previous && typeof previous === 'object', 'rapport de référence invalide');
  const comparison = previous.comparison;
  requireMatch(comparison && expected.comparison, 'identité de comparaison absente');
  for (const key of [
    'mode',
    'baselineEngineSha256',
    'updatedEngineSha256',
    'baselineEngineFiles',
    'updatedEngineFiles',
    'baselineBinarySha256',
    'updatedBinarySha256',
    'ffmpegBinarySha256',
    'fragments'
  ]) {
    requireMatch(
      comparison[key] !== undefined && isDeepStrictEqual(comparison[key], expected.comparison[key]),
      `${key} différent ou absent`
    );
  }
  requireMatch(
    isDeepStrictEqual(previous.methodology, expected.methodology),
    'méthodologie ou répétitions différentes'
  );
  for (const key of ['node', 'platform']) {
    requireMatch(
      previous.environment?.[key] === expected.environment?.[key],
      `environnement ${key} différent`
    );
  }
}

function validateQuality(trial, source, exactStreams, decoded) {
  const quality = trial.quality;
  requireMatch(quality?.validated === true, 'qualité non validée');
  requireMatch(
    quality.height === source.height && quality.codec === 'h264' && quality.audioCodec === 'aac',
    'formats vidéo ou audio non validés'
  );
  requireMatch(
    Number.isFinite(quality.duration) && Math.abs(quality.duration - source.duration) < 0.1,
    'durée non validée'
  );
  requireMatch(
    Number.isSafeInteger(quality.bytes) && quality.bytes > 0,
    'taille de sortie invalide'
  );
  requireMatch(
    typeof quality.streamHashes === 'string' && quality.streamHashes.length > 0,
    'empreintes des flux absentes'
  );
  requireMatch(
    typeof quality.compressedStreamsIdentical === 'boolean',
    'comparaison des flux absente'
  );
  if (exactStreams) {
    requireMatch(
      quality.compressedStreamsIdentical && quality.streamHashes === source.streamHashes,
      'flux audio ou vidéo différents'
    );
  }
  if (decoded || quality.frames !== undefined) {
    requireMatch(
      quality.frames === Math.round(source.duration * 30),
      'décodage intégral non validé'
    );
  }
}

function validateResumeCases(previous, expected) {
  requireMatch(Array.isArray(previous.cases), 'cas de référence absents');
  if (previous.cases.length)
    requireMatch(Array.isArray(previous.sources), 'sources de référence absentes');
  const seenCases = new Set();
  for (const entry of previous.cases) {
    requireMatch(
      entry && typeof entry.id === 'string' && !seenCases.has(entry.id),
      'cas invalide ou dupliqué'
    );
    seenCases.add(entry.id);
    const source = expected.sources.find((candidate) =>
      [`${candidate.label}-fragmented`, `${candidate.label}-compatible-container`].includes(
        entry.id
      )
    );
    requireMatch(source, `cas inconnu ${entry.id}`);
    const previousSources = previous.sources?.filter(
      (candidate) => candidate.label === source.label
    );
    requireMatch(previousSources?.length === 1, `source ${source.label} absente ou dupliquée`);
    for (const key of ['sha256', 'height', 'width', 'duration', 'streamHashes']) {
      requireMatch(
        previousSources[0][key] === source[key],
        `source ${source.label} différente (${key})`
      );
    }
    const container = entry.id.endsWith('-compatible-container');
    const fragments = expected.comparison.fragments;
    const variants = container ? ['baseline', 'optimized'] : Object.keys(fragments);
    const rounds = container ? 1 : expected.methodology.repetitions;
    requireMatch(
      Array.isArray(entry.trials) && entry.trials.length === variants.length * rounds,
      `essais incomplets pour ${entry.id}`
    );
    const seenTrials = new Set();
    for (const trial of entry.trials) {
      requireMatch(
        trial && variants.includes(trial.variant),
        `variante inattendue dans ${entry.id}`
      );
      const repetition = container ? 0 : trial.repetition;
      requireMatch(
        Number.isInteger(repetition) && repetition >= 0 && repetition < rounds,
        `répétition invalide dans ${entry.id}`
      );
      const key = `${trial.variant}:${repetition}`;
      requireMatch(!seenTrials.has(key), `essai dupliqué dans ${entry.id}`);
      seenTrials.add(key);
      requireMatch(Number.isFinite(trial.seconds) && trial.seconds > 0, 'temps de mesure invalide');
      if (!container) {
        requireMatch(
          trial.concurrentFragments === fragments[trial.variant],
          'parallélisme différent'
        );
        requireMatch(
          Number.isFinite(trial.timeToFirstMediaRequest) &&
            trial.timeToFirstMediaRequest >= 0 &&
            trial.timeToFirstMediaRequest <= trial.seconds,
          'premier transfert non mesuré'
        );
        requireMatch(
          Number.isSafeInteger(trial.mediaRequests) &&
            trial.mediaRequests > 0 &&
            Number.isSafeInteger(trial.metadataRequestsDuringDownload) &&
            trial.metadataRequestsDuringDownload >= 0,
          'requêtes non mesurées'
        );
      }
      const exactStreams =
        !container ||
        trial.variant !== 'baseline' ||
        expected.comparison.mode === 'current-baseline-versus-updated';
      validateQuality(trial, source, exactStreams, container || repetition === 0);
    }
  }
}

module.exports = { median, validateResumeCompatibility, validateResumeCases };
