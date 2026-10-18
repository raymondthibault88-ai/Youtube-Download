import type { VideoFormat } from '../types';

export function qualityLabel(resolution?: string) {
  const match = resolution?.match(/(?:\d+[x×])?(\d+)(?:p)?$/i);
  const height = match ? Number(match[1]) : 0;
  if (height >= 2160) return '4K';
  if (height >= 1440) return '1440p';
  return height ? `${height}p` : resolution || 'Qualité d’origine';
}

export function getQualityChoices(formats: VideoFormat[], selected: VideoFormat | null) {
  const recommended = formats.find((format) => format.quickTimeCompatible) || formats[0];
  const candidates = [
    recommended,
    formats[0],
    ...formats.filter((format) => format.quickTimeCompatible),
    ...formats
  ].filter(Boolean);
  const choices: VideoFormat[] = [];
  for (const candidate of candidates) {
    if (
      !choices.some(
        (format) => qualityLabel(format.resolution) === qualityLabel(candidate.resolution)
      )
    )
      choices.push(candidate);
    if (choices.length === 3) break;
  }
  if (selected && !choices.some((format) => format.id === selected.id)) {
    if (choices.length === 3) choices[2] = selected;
    else choices.push(selected);
  }
  return { recommended, choices };
}
