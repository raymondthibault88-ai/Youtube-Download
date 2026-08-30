import { memo } from "react";
import type { VideoFormat } from "../../types/video";
import { formatSize } from "../../../shared/formatters.js";
import { getCodecLabel } from "../../utils/codecs";

interface FormatRowProps {
  format: VideoFormat;
  isSelected: boolean;
  onSelect: (format: VideoFormat) => void;
}

const FormatRow = memo(function FormatRow({ format, isSelected, onSelect }: FormatRowProps) {
  const mediaType = format.hasVideo && format.hasAudio
    ? "Vidéo + Audio"
    : format.hasVideo
      ? "Vidéo seule"
      : "Audio seul";
  const videoCodecLabel = getCodecLabel(format.videoCodec);
  const audioCodecLabel = format.hasAudio
    ? getCodecLabel(format.audioCodec)
    : format.quickTimeCompatible
      ? "AAC"
      : null;
  const codecLabel = [videoCodecLabel, audioCodecLabel].filter(Boolean).join(" + ") || "-";

  return (
    <tr className={isSelected ? "is-active" : ""} onClick={() => onSelect(format)}>
      <td>
        <label className="format-choice">
          <input type="radio" name="format" checked={isSelected} onChange={() => onSelect(format)} />
          <strong>{format.resolution}</strong>
        </label>
      </td>
      <td><strong className="uppercase">{format.ext}</strong><span className="cell-detail">{codecLabel} · {mediaType}</span></td>
      <td><span className={`compat-badge ${format.quickTimeCompatible ? "is-direct" : ""}`}>{format.quickTimeCompatible ? "Direct" : "Réencodage"}</span></td>
      <td>{format.fps || "-"}</td>
      <td className="size-cell">{formatSize(format.fileSizeText) || "—"}</td>
    </tr>
  );
});

export default FormatRow;
