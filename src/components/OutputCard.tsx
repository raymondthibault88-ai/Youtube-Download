import { ArrowDownToLine, ChevronDown, FileVideo, Folder } from 'lucide-react';
import styles from './OutputCard.module.css';

interface OutputCardProps {
  ready: boolean;
  quality?: string;
  detail?: string;
  estimatedSize?: string | null;
  outputDir: string;
  onPickFolder: () => void;
  onStart: () => void;
  disabled: boolean;
  busy: boolean;
  action: string;
}

export default function OutputCard({
  ready,
  quality,
  detail,
  estimatedSize,
  outputDir,
  onPickFolder,
  onStart,
  disabled,
  busy,
  action
}: OutputCardProps) {
  return (
    <aside
      className={`${styles.card} output-card ${ready ? 'is-ready' : ''}`}
      aria-label="Fichier de sortie"
    >
      <div className="output-info">
        <span className="output-icon" aria-hidden="true">
          <FileVideo size={20} />
        </span>
        <div className="output-summary">
          <h2>MP4{ready && quality && <span>{quality}</span>}</h2>
          {ready && (detail || estimatedSize) && (
            <p>
              {detail}
              {detail && estimatedSize && <span aria-hidden="true"> · </span>}
              {estimatedSize && <span title="Taille estimée">{estimatedSize}</span>}
            </p>
          )}
        </div>
      </div>
      <div className="output-destination">
        <span className="destination-label">Enregistrer dans</span>
        <button
          type="button"
          className="destination-button"
          onClick={onPickFolder}
          disabled={busy}
          title={outputDir || 'Choisir un dossier'}
          aria-label={`Changer le dossier de sortie : ${outputDir || 'aucun dossier choisi'}`}
        >
          <Folder size={16} aria-hidden="true" />
          <span>{outputDir || 'Choisir un dossier'}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        className="button button-primary output-action"
        onClick={onStart}
        disabled={disabled}
      >
        {busy ? (
          <span className="spinner" aria-hidden="true" />
        ) : (
          <ArrowDownToLine size={17} aria-hidden="true" />
        )}
        {action}
      </button>
    </aside>
  );
}
