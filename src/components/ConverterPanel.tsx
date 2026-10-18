import { ArrowRight, FileVideo, ShieldCheck } from 'lucide-react';
import { formatBytes, formatDuration } from '../../shared/formatters.js';
import type { RunMediaJob } from '../hooks/useMediaJob';
import OutputCard from './OutputCard';
import ConversionSettings from './ConversionSettings';
import useConversion from '../hooks/useConversion';

interface ConverterPanelProps {
  outputDir: string;
  onPickFolder: () => void;
  busy: boolean;
  run: RunMediaJob;
  onError: (message: string) => void;
  onSourceChange: () => void;
}

export default function ConverterPanel({
  outputDir,
  onPickFolder,
  busy,
  run,
  onError,
  onSourceChange
}: ConverterPanelProps) {
  const {
    file,
    selecting,
    targetHeight,
    setTargetHeight,
    profileId,
    setProfileId,
    converting,
    select,
    convert
  } = useConversion({ outputDir, busy, run, onError, onSourceChange });
  const estimatedSize = file?.outputOptions.find((option) => option.height === targetHeight)
    ?.estimates[profileId];
  const compressing = profileId !== 'fast';
  const profileLabel = compressing
    ? `Compression ${profileId === 'compact' ? 'forte' : 'modérée'}`
    : 'Conversion rapide';
  const sizeChange =
    file && file.size > 0 && estimatedSize
      ? Math.round((1 - estimatedSize / file.size) * 100)
      : null;
  const sizeChangeLabel =
    sizeChange === null
      ? null
      : sizeChange === 0
        ? 'Taille similaire'
        : `≈ ${Math.abs(sizeChange)} % ${sizeChange > 0 ? 'de moins' : 'de plus'}`;
  const quality = targetHeight ? `${targetHeight}p` : file ? `${file.height}p` : undefined;
  return (
    <div className="workspace">
      <section className="source-card" aria-label="Vidéo à convertir">
        <div className={file ? 'sr-only' : 'section-heading'}>
          <h2>Convertir ou compresser une vidéo</h2>
        </div>
        {file ? (
          <>
            <div className="local-file">
              <span className="local-file-icon">
                <FileVideo size={27} aria-hidden="true" />
              </span>
              <div>
                <h3>{file.name}</h3>
                <p>
                  {formatBytes(file.size)} · {formatDuration(file.duration)} · {file.width} ×{' '}
                  {file.height}
                </p>
              </div>
              <button
                type="button"
                className="text-button"
                onClick={select}
                disabled={busy || selecting}
              >
                {selecting ? 'Lecture…' : 'Changer'}
              </button>
            </div>
            <ConversionSettings
              file={file}
              profileId={profileId}
              onProfileChange={setProfileId}
              targetHeight={targetHeight}
              onTargetHeightChange={setTargetHeight}
              disabled={busy || selecting}
            />
            <div className="size-preview" role="group" aria-label="Comparaison du poids du fichier">
              <div>
                <span>Avant</span>
                <strong>{formatBytes(file.size) || 'Non connu'}</strong>
              </div>
              <ArrowRight size={18} aria-hidden="true" />
              <div>
                <span>Après estimé</span>
                <strong>{estimatedSize ? `≈ ${formatBytes(estimatedSize)}` : 'Non connu'}</strong>
              </div>
              {sizeChangeLabel && <span className="size-change">{sizeChangeLabel}</span>}
            </div>
            {compressing && sizeChange !== null && sizeChange <= 0 && (
              <p className="compression-no-gain">
                Pour un fichier plus petit, essayez une définition inférieure.
              </p>
            )}
          </>
        ) : (
          <div className="file-picker">
            <span className="file-picker-icon" aria-hidden="true">
              <FileVideo size={24} strokeWidth={1.5} />
            </span>
            <div className="file-picker-content">
              <button
                type="button"
                className="button button-secondary"
                onClick={select}
                disabled={busy || selecting}
              >
                {selecting && <span className="spinner" aria-hidden="true" />}
                {selecting ? 'Lecture…' : 'Choisir une vidéo'}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
              <span className="supported-formats">MP4, MOV, MKV, AVI, WebM, MTS…</span>
            </div>
          </div>
        )}
        <div className="source-note">
          <ShieldCheck size={17} aria-hidden="true" />
          <span>Original conservé</span>
        </div>
      </section>
      <OutputCard
        ready={Boolean(file)}
        quality={quality}
        detail={profileLabel}
        estimatedSize={estimatedSize ? `≈ ${formatBytes(estimatedSize)}` : null}
        outputDir={outputDir}
        onPickFolder={onPickFolder}
        onStart={() => void convert()}
        disabled={!file || busy || selecting}
        busy={busy}
        action={
          converting
            ? 'Traitement en cours…'
            : compressing
              ? 'Compresser la vidéo'
              : 'Convertir en MP4'
        }
      />
    </div>
  );
}
