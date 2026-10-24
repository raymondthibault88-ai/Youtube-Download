import { Progress } from '@base-ui/react/progress';
import { Check, CirclePause, FileVideo, FolderOpen, X } from 'lucide-react';
import type { JobSnapshot } from '../types/job';
import type { MediaOperation } from '../hooks/useMediaJob';
import { formatBytes } from '../../shared/formatters.js';

interface JobStatusProps {
  job: JobSnapshot | null;
  pendingType: MediaOperation | null;
  onCancel: () => void;
  onReveal: (path: string) => void;
  onDismiss: () => void;
}

export default function JobStatus({
  job,
  pendingType,
  onCancel,
  onReveal,
  onDismiss
}: JobStatusProps) {
  if (!job && !pendingType) return null;
  if (job?.state === 'failed') return null;
  const type = job?.type || pendingType;
  const active = !job || job.state === 'running' || job.state === 'cancelling';
  const completed = job?.state === 'completed';
  const result = job?.result;
  const conversion = job?.type === 'conversion' ? job.result : null;
  const outputPath = result?.outputPath;
  const title = active
    ? job?.state === 'cancelling'
      ? 'Annulation en cours…'
      : type === 'download'
        ? 'Téléchargement en cours'
        : 'Traitement en cours'
    : completed
      ? 'Fichier enregistré'
      : 'Traitement annulé';
  const percent = job ? Math.max(0, Math.min(100, Math.round(job.percent || 0))) : null;
  return (
    <section
      className={`job-status ${completed ? 'is-complete' : ''}`}
      aria-label="Suivi du traitement"
    >
      <div className="job-icon" aria-hidden="true">
        {active ? (
          <FileVideo size={21} />
        ) : completed ? (
          <Check size={21} />
        ) : (
          <CirclePause size={21} />
        )}
      </div>
      <div className="job-content">
        <div className="job-title-row" role="status">
          <h2>{title}</h2>
          {active && percent !== null && (
            <span className="job-percent" aria-hidden="true">
              {percent}%
            </span>
          )}
        </div>
        {active && <p>{job?.raw || 'Préparation…'}</p>}
        {active && (
          <Progress.Root
            value={percent}
            className="job-progress"
            aria-label={
              type === 'download' ? 'Progression du téléchargement' : 'Progression du traitement'
            }
          >
            <Progress.Track className="progress-track">
              <Progress.Indicator className="progress-indicator" />
            </Progress.Track>
          </Progress.Root>
        )}
        {active && (job?.eta || job?.speed) && (
          <div className="job-meta">
            {job.eta && <span>Temps restant : {job.eta}</span>}
            {job.speed && (
              <span>
                {type === 'download' ? 'Débit' : 'Vitesse'} : {job.speed}
              </span>
            )}
          </div>
        )}
        {completed && conversion && conversion.inputSize > 0 && (
          <div className="job-meta">
            <span>
              {formatBytes(conversion.inputSize)} → {formatBytes(conversion.outputSize)}
            </span>
            <span>
              {conversion.outputSize <= conversion.inputSize
                ? `${Math.round((1 - conversion.outputSize / conversion.inputSize) * 100)} % d’espace gagné`
                : 'Le fichier obtenu est plus volumineux.'}
            </span>
          </div>
        )}
        {completed && outputPath && (
          <span className="job-path" title={outputPath}>
            {outputPath}
          </span>
        )}
      </div>
      <div className="job-actions">
        {active ? (
          <button
            type="button"
            className="button button-secondary"
            onClick={onCancel}
            disabled={!job || job.state === 'cancelling'}
          >
            Annuler
          </button>
        ) : (
          <>
            {completed && outputPath && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => onReveal(outputPath)}
              >
                <FolderOpen size={16} aria-hidden="true" />
                Afficher le fichier
              </button>
            )}
            <button
              type="button"
              className="icon-button"
              onClick={onDismiss}
              aria-label="Fermer le suivi"
            >
              <X size={18} />
            </button>
          </>
        )}
      </div>
    </section>
  );
}
