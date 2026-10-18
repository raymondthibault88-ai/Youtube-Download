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
    <div className="setting-row">
      <h3 id="quality-label">Qualité</h3>
      <RadioGroup className="inline-options" value={selected?.id || ""} onValueChange={(id) => { const format = formats.find((entry) => entry.id === id); if (format) onSelect(format); }} disabled={disabled} aria-labelledby="quality-label">
        {choices.map((format) => <Radio.Root key={format.id} value={format.id} className="inline-option" aria-label={`${qualityLabel(format.resolution)}${format.id === recommended?.id ? ", recommandée" : ""}, format ${format.id}`}><span className="radio-indicator"><Check size={12} aria-hidden="true" /></span><span>{qualityLabel(format.resolution)}</span><span className="option-meta">{format.id === recommended?.id ? "Recommandée" : format.fps ? `${format.fps} i/s` : ""}</span></Radio.Root>)}
      </RadioGroup>
    </div>
    <p className="choice-help">Son ajouté si disponible.</p>
    <Disclosure title="Voir tous les formats"><FormatsTable formats={formats} selected={selected?.id || null} onSelect={onSelect} disabled={disabled} /></Disclosure>
  </div>;
}
