import type { VideoFormat } from '../types';

export function qualityLabel(resolution?: string) {
  const match = resolution?.trim().match(/^(\d+)(?:\s*[x×]\s*(\d+)|p)?$/i);
  if (!match) return resolution || 'Qualité d’origine';
  const [, first, second = first] = match;
  const definition = Math.min(Number(first), Number(second));
  if (definition === 4320) return '8K';
  if (definition === 2160) return '4K';
  return `${definition}p`;
}

export function getQualityChoices(formats: VideoFormat[], selected: VideoFormat | null) {
  const recommended = formats.find((format) => format.quickTimeCompatible) || formats[0];
  const candidates = [
    recommended,
    formats[0],
    formats.find((format) => qualityLabel(format.resolution) === '4K'),
    ...formats.filter((format) => format.quickTimeCompatible),
    ...formats
  ];
  const choices = new Map<string, VideoFormat>();
  for (const candidate of candidates) {
    if (!candidate) continue;
    const label = qualityLabel(candidate.resolution);
    if (!choices.has(label)) choices.set(label, candidate);
    if (choices.size === 3) break;
  }
  if (selected) choices.set(qualityLabel(selected.resolution), selected);
  return { recommended, choices: [...choices.values()] };
}
