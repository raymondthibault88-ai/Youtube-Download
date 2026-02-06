import { memo } from "react";
import type { VideoFormat } from "../../types/video";
import { formatSize } from "../../../shared/formatters.js";

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

  return (
    <tr className={isSelected ? "is-active" : ""}>
      <td>
        <input
          type="radio"
          name="format"
          checked={isSelected}
          onChange={() => onSelect(format)}
        />
      </td>
      <td>{format.resolution}</td>
      <td>{mediaType}</td>
      <td className="uppercase">{format.ext}</td>
      <td>{format.fps || "-"}</td>
      <td>{formatSize(format.fileSizeText)}</td>
    </tr>
  );
});

export default FormatRow;
