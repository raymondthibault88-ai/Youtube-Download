const fs = require('node:fs');
const path = require('node:path');
const { formatBytes, formatEta } = require('../../shared/formatters.js');

const PROGRESS_PREFIX = '__YTDLP_PROGRESS__:';

function parseDownloadProgress(line) {
  const percent = Number(line.match(/(\d+(?:\.\d+)?)%/)?.[1]);
  return {
    percent: Number.isFinite(percent) ? percent : null,
    speed: line.match(/at\s+([^\s]+\/?s)/i)?.[1] || null,
    eta: line.match(/ETA\s+([^\s]+)/i)?.[1] || null,
    raw: line.trim()
  };
}

function normalizeProgressValue(value) {
  const normalized = String(value || '').trim();
  return normalized && normalized !== 'NA' ? normalized : null;
}

function parseDownloadOutputLine(line, recode = false) {
  const trimmedLine = String(line || '').trim();
  if (trimmedLine.startsWith('__YTDLP_FILE__:')) {
    return { outputPath: trimmedLine.slice('__YTDLP_FILE__:'.length).trim() };
  }
  if (trimmedLine.startsWith(PROGRESS_PREFIX)) {
    const [percentText = '', speedText = '', etaText = ''] = trimmedLine.slice(PROGRESS_PREFIX.length).split('|');
    const percent = Number(percentText.match(/\d+(?:\.\d+)?/)?.[0]);
    if (!Number.isFinite(percent)) return null;
    return {
      progress: {
        percent: Math.round(percent * (recode ? 0.82 : 0.97)),
        speed: normalizeProgressValue(speedText),
        eta: normalizeProgressValue(etaText),
        raw: `Téléchargement… ${percent.toFixed(1)}%`
      }
    };
  }
  if (!trimmedLine.includes('[download]')) return null;

  const progress = parseDownloadProgress(trimmedLine);
  if (progress.percent === null) return null;
  progress.percent = Math.round(progress.percent * (recode ? 0.82 : 0.97));
  return { progress };
}

function createLineConsumer(onLine) {
  let buffer = '';
  const consume = (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r\n|\r|\n/);
    buffer = lines.pop() || '';
    for (const line of lines) onLine(line);
  };
  consume.flush = () => {
    if (!buffer) return;
    onLine(buffer);
    buffer = '';
  };
  return consume;
}

function estimateWrittenProgress(writtenBytes, expectedSizeBytes, rangeEnd = 97) {
  if (!(writtenBytes > 0) || !(expectedSizeBytes > 0)) return 0;
  return Math.max(1, Math.min(rangeEnd, Math.floor((writtenBytes / expectedSizeBytes) * rangeEnd)));
}

async function snapshotDirectory(directory) {
  const snapshot = new Map();
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
    const filePath = path.join(directory, entry.name);
    const stats = await fs.promises.stat(filePath).catch(() => null);
    if (stats) snapshot.set(entry.name, stats.size);
  }));
  return snapshot;
}

async function startDirectoryProgressMonitor({ outputDir, expectedSizeBytes, rangeEnd, onProgress }) {
  if (!(expectedSizeBytes > 0)) return () => {};
  const baseline = await snapshotDirectory(outputDir).catch(() => new Map());
  let previousBytes = 0;
  let previousAt = Date.now();
  let checking = false;

  const timer = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      const current = await snapshotDirectory(outputDir);
      let writtenBytes = 0;
      for (const [name, size] of current) writtenBytes += Math.max(0, size - (baseline.get(name) || 0));
      const percent = estimateWrittenProgress(writtenBytes, expectedSizeBytes, rangeEnd);
      if (!percent) return;

      const now = Date.now();
      const elapsedSeconds = Math.max(0.001, (now - previousAt) / 1000);
      const bytesPerSecond = Math.max(0, (writtenBytes - previousBytes) / elapsedSeconds);
      const remainingSeconds = bytesPerSecond > 0 ? Math.max(0, (expectedSizeBytes - writtenBytes) / bytesPerSecond) : null;
      onProgress({
        percent,
        speed: bytesPerSecond > 0 ? `${formatBytes(bytesPerSecond)}/s` : null,
        eta: remainingSeconds === null ? null : formatEta(remainingSeconds),
        raw: `Téléchargement… ${percent}%`
      });
      previousBytes = writtenBytes;
      previousAt = now;
    } catch {
      // Native yt-dlp progress remains the primary source if polling fails.
    } finally {
      checking = false;
    }
  }, 750);
  timer.unref();
  return () => clearInterval(timer);
}

module.exports = {
  PROGRESS_PREFIX,
  createLineConsumer,
  estimateWrittenProgress,
  parseDownloadOutputLine,
  parseDownloadProgress,
  startDirectoryProgressMonitor
};
