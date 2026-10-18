import { RadioGroup } from "@base-ui/react/radio-group";
import { Radio } from "@base-ui/react/radio";
import { Check } from "lucide-react";
import type { VideoFormat } from "../types";
import { getQualityChoices, qualityLabel } from "../utils/media";
import Disclosure from "./ui/Disclosure";
import FormatsTable from "./ui/FormatsTable";

export default function VideoPanel({ formats, selected, onSelect, disabled }: { formats: VideoFormat[]; selected: VideoFormat | null; onSelect: (format: VideoFormat) => void; disabled: boolean }) {
  const { choices, recommended } = getQualityChoices(formats, selected);
  return <div className="video-options">
    <div className="option-heading"><h3 id="quality-label">Qualité</h3></div>
    <RadioGroup className="quality-options" value={selected?.id || ""} onValueChange={(id) => { const format = formats.find((entry) => entry.id === id); if (format) onSelect(format); }} disabled={disabled} aria-labelledby="quality-label">
      {choices.map((format) => <Radio.Root key={format.id} value={format.id} className="quality-option" aria-label={`${qualityLabel(format.resolution)}${format.id === recommended?.id ? ", recommandée" : ""}, format ${format.id}`}><div className="quality-option-top"><span>{qualityLabel(format.resolution)}</span><span className="radio-indicator"><Check size={12} aria-hidden="true" /></span></div><span className="quality-description">{format.id === recommended?.id ? "Recommandée" : format.fps ? `${format.fps} images / seconde` : "Autre qualité"}</span></Radio.Root>)}
    </RadioGroup>
    <p className="choice-help">Son ajouté si disponible.</p>
    <Disclosure title="Voir tous les formats"><FormatsTable formats={formats} selected={selected?.id || null} onSelect={onSelect} disabled={disabled} /></Disclosure>
  </div>;
}
