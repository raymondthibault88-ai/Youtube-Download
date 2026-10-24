import { RadioGroup } from '@base-ui/react/radio-group';
import { Radio } from '@base-ui/react/radio';
import { Check } from 'lucide-react';

export default function LibraryQuality({
  height,
  onChange,
  disabled
}: {
  height: number | null;
  onChange: (height: number | null) => void;
  disabled: boolean;
}) {
  return (
    <div className="library-quality setting-row">
      <h3 id="batch-quality-label">Qualité du lot</h3>
      <RadioGroup
        className="inline-options"
        value={height === null ? 'recommended' : String(height)}
        onValueChange={(value) => onChange(value === 'recommended' ? null : Number(value))}
        disabled={disabled}
        aria-labelledby="batch-quality-label"
      >
        {[null, 2160, 1440, 1080, 720, 480].map((value) => (
          <Radio.Root
            key={value ?? 'recommended'}
            className="inline-option"
            value={value === null ? 'recommended' : String(value)}
            aria-label={
              value === null
                ? 'Qualité recommandée pour le lot'
                : `${value === 2160 ? '4K' : `${value}p`} pour le lot`
            }
          >
            <span className="radio-indicator">
              <Check size={12} aria-hidden="true" />
            </span>
            <span>{value === null ? 'Recommandée' : value === 2160 ? '4K' : `${value}p`}</span>
          </Radio.Root>
        ))}
      </RadioGroup>
      {height !== null && (
        <p className="library-help library-quality-help">
          Jusqu’à {height === 2160 ? '4K' : `${height}p`}, selon la vidéo.
        </p>
      )}
    </div>
  );
}
