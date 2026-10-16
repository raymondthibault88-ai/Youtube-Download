import type { VideoFormat } from "../types/video";

export function qualityLabel(format: VideoFormat) {
  const height = format.resolution?.match(/[×x]\s*(\d+)/i)?.[1];
  return height ? `${height}p` : format.resolution || "Qualité originale";
}

export function finalFormatSummary(format: VideoFormat) {
  return `${qualityLabel(format)} · MP4 compatible · ${format.hasAudio ? "Audio inclus" : "Son ajouté si disponible"}`;
}
