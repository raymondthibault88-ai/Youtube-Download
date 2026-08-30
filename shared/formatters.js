export function formatDuration(value) {
  if (!value) return '-';
  const total = Number(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatSize(sizeText) {
  return sizeText || '-';
}

export function formatBytes(bytes) {
  if (!bytes || Number.isNaN(bytes)) {
    return null;
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let index = 0;
  let value = bytes;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(1)} ${units[index]}`;
}

export function formatEta(seconds) {
  const rounded = Math.ceil(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return minutes > 0 ? `${minutes}:${String(remainder).padStart(2, '0')}` : `${remainder}s`;
}
