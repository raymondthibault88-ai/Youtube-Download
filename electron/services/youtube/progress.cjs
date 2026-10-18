const { stripVTControlCharacters } = require('node:util');
const PROGRESS_PREFIX = '__YTDLP_PROGRESS__:';
const PROGRESS_TEMPLATE =
  'download:__YTDLP_PROGRESS__:{"id":%(info.format_id)j,"percent":%(progress._percent_str)j,"speed":%(progress._speed_str)j,"eta":%(progress._eta_str)j}';
function parseDownloadProgress(line) {
  const percent = Number(line.match(/(\d+(?:\.\d+)?)%/)?.[1]);
  return {
    percent: Number.isFinite(percent) ? percent : null,
    speed: line.match(/at\s+([^\s]+\/?s)/i)?.[1] || null,
    eta: line.match(/ETA\s+([^\s]+)/i)?.[1] || null,
    raw: line.trim()
  };
}

function createDownloadProgressTracker({ separateAudio = false, recode = false } = {}) {
  const streams = new Map();
  let lastPercent = 0;
  return (line) => {
    if (!line.startsWith(PROGRESS_PREFIX)) return null;
    let data;
    try {
      data = JSON.parse(line.slice(PROGRESS_PREFIX.length));
    } catch {
      return null;
    }
    const percent = Number.parseFloat(stripVTControlCharacters(String(data.percent)));
    if (!Number.isFinite(percent)) return null;
    const id = String(data.id);
    streams.set(id, Math.max(streams.get(id) || 0, Math.max(0, Math.min(100, percent))));
    const ratio =
      [...streams.values()].reduce((sum, value) => sum + value, 0) / (separateAudio ? 2 : 1);
    lastPercent = Math.max(lastPercent, Math.round(Math.min(100, ratio) * (recode ? 0.82 : 0.97)));
    const stage = separateAudio && streams.size > 1 ? 'audio' : 'video';
    const clean = (value) =>
      value && !/^(NA|N\/A|Unknown)/i.test(String(value).trim()) ? String(value).trim() : null;
    return {
      percent: lastPercent,
      speed: clean(data.speed),
      eta: clean(data.eta),
      stage,
      raw: stage === 'audio' ? 'Récupération du son…' : 'Récupération de la vidéo…'
    };
  };
}
module.exports = { PROGRESS_TEMPLATE, parseDownloadProgress, createDownloadProgressTracker };
