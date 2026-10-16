import { memo } from "react";
import type { VideoFormat } from "../../types/video";
import { formatSize } from "../../../shared/formatters.js";
import { getCodecLabel } from "../../utils/codecs";
import { qualityLabel } from "../../utils/formats";

interface FormatRowProps {
  format: VideoFormat;
  isSelected: boolean;
  disabled: boolean;
  showDetails: boolean;
  onSelect: (format: VideoFormat) => void;
}

export default memo(function FormatRow({ format, isSelected, disabled, showDetails, onSelect }: FormatRowProps) {
  const codecs = [getCodecLabel(format.videoCodec), format.hasAudio ? getCodecLabel(format.audioCodec) : null].filter(Boolean).join(" + ");
  const direct = format.quickTimeCompatible && format.ext?.toLowerCase() === "mp4";
  return <tr className={`${isSelected ? "is-active" : ""} ${disabled ? "is-disabled" : ""}`} onClick={() => { if (!disabled) onSelect(format); }}>
    <td><label className="format-choice"><input type="radio" name="format" checked={isSelected} disabled={disabled} onChange={() => onSelect(format)} /><strong>{qualityLabel(format)}</strong></label></td>
    <td><strong>MP4 compatible</strong><span className="cell-detail">{format.hasAudio ? "Audio inclus" : "Son ajouté si disponible"}</span></td>
    <td><span className={`compat-badge ${direct ? "is-direct" : ""}`}>{direct ? format.hasAudio ? "Sans conversion" : "Assemblage audio" : "Conversion en MP4"}</span></td>
    <td className="size-cell">{formatSize(format.fileSizeText) || "—"}</td>
    {showDetails && <><td><strong className="uppercase">{format.ext || "—"}</strong><span className="cell-detail">{codecs || "Codec inconnu"} · {format.hasAudio ? "avec audio" : "sans piste audio"}</span><span className="cell-detail">{format.resolution || "—"}</span></td><td>{format.fps ? `${format.fps} i/s` : "—"}</td></>}
  </tr>;
});
