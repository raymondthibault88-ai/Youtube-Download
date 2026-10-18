import { RadioGroup } from '@base-ui/react/radio-group';
import { Radio } from '@base-ui/react/radio';
import { Check, FileVideo, Minimize2 } from 'lucide-react';
import type { SelectedVideoFile } from '../types';
import type { ConversionProfile } from '../types/conversion';

interface ConversionSettingsProps {
  file: SelectedVideoFile;
  profileId: ConversionProfile;
  onProfileChange: (profile: ConversionProfile) => void;
  targetHeight: number | null;
  onTargetHeightChange: (height: number | null) => void;
  disabled: boolean;
}
const profiles = [
  { id: 'balanced', title: 'Modérée' },
  { id: 'compact', title: 'Forte' }
] as const;

export default function ConversionSettings({
  file,
  profileId,
  onProfileChange,
  targetHeight,
  onTargetHeightChange,
  disabled
}: ConversionSettingsProps) {
  const compressing = profileId !== 'fast';
  return (
    <div className="conversion-settings">
      <div className="setting-row">
        <h3 id="intent-label">Action</h3>
        <RadioGroup
          className="intent-options"
          value={compressing ? 'compress' : 'convert'}
          onValueChange={(value) =>
            onProfileChange(
              value === 'convert' ? 'fast' : profileId === 'compact' ? 'compact' : 'balanced'
            )
          }
          disabled={disabled}
          aria-labelledby="intent-label"
        >
          <Radio.Root className="intent-option" value="convert" aria-label="Convertir en MP4">
            <FileVideo size={16} aria-hidden="true" />
            <span>Convertir en MP4</span>
          </Radio.Root>
          <Radio.Root className="intent-option" value="compress" aria-label="Compresser">
            <Minimize2 size={16} aria-hidden="true" />
            <span>Compresser</span>
          </Radio.Root>
        </RadioGroup>
      </div>
      {compressing && (
        <div className="setting-row">
          <h3 id="compression-label">Compression</h3>
          <RadioGroup
            className="inline-options"
            value={profileId}
            onValueChange={(value) => onProfileChange(value)}
            disabled={disabled}
            aria-labelledby="compression-label"
            aria-describedby="compression-help"
          >
            {profiles.map((entry) => (
              <Radio.Root className="inline-option" value={entry.id} key={entry.id}>
                <span className="radio-indicator">
                  <Check size={12} aria-hidden="true" />
                </span>
                <span>{entry.title}</span>
              </Radio.Root>
            ))}
          </RadioGroup>
          <p id="compression-help" className="setting-help">
            Une compression plus forte peut réduire la qualité.
          </p>
        </div>
      )}
      <div className="setting-row">
        <h3 id="resolution-label">Définition</h3>
        <RadioGroup
          className="inline-options"
          value={targetHeight === null ? 'source' : String(targetHeight)}
          onValueChange={(value) => onTargetHeightChange(value === 'source' ? null : Number(value))}
          disabled={disabled}
          aria-labelledby="resolution-label"
        >
          {file.outputOptions.map((option) => (
            <Radio.Root
              key={option.height ?? 'source'}
              className="inline-option"
              value={option.height === null ? 'source' : String(option.height)}
              aria-label={
                option.height === null
                  ? `Conserver la définition, ${file.height}p`
                  : `${option.height}p`
              }
            >
              <span className="radio-indicator">
                <Check size={12} aria-hidden="true" />
              </span>
              <span>{option.height === null ? 'Originale' : `${option.height}p`}</span>
              {option.height === null && <span className="option-meta">{file.height}p</span>}
            </Radio.Root>
          ))}
        </RadioGroup>
      </div>
    </div>
  );
}
