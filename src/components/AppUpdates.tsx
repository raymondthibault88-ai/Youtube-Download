import { ArrowDownToLine, ExternalLink, RefreshCw } from 'lucide-react';
import {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  openUpdateRelease
} from '../services/desktopApi';
import type { UpdateSnapshot } from '../types/update';

interface AppUpdatesProps {
  update: UpdateSnapshot | null;
  actionError: string;
  busy: boolean;
  request: (action: () => Promise<unknown>) => Promise<void>;
}

export default function AppUpdates({ update, actionError, busy, request }: AppUpdatesProps) {
  const status = update?.status;
  const working = status === 'checking' || status === 'downloading' || status === 'installing';
  const manual = update?.mode === 'manual';
  const message = !update
    ? 'Chargement des informations…'
    : status === 'disabled'
      ? 'Les mises à jour sont disponibles dans l’application distribuée.'
      : status === 'checking'
        ? 'Recherche d’une nouvelle version…'
        : status === 'not-available'
          ? 'Vous utilisez la dernière version.'
          : status === 'available'
            ? `La version ${update.version} est disponible.`
            : status === 'downloading'
              ? `Téléchargement de la mise à jour : ${Math.floor(update.percent)} %`
              : status === 'downloaded'
                ? `La version ${update.version} est prête à être installée.`
                : status === 'installing'
                  ? 'Installation de la mise à jour et redémarrage…'
                  : status === 'error'
                    ? update.error
                    : 'La recherche de mises à jour est automatique au démarrage.';
  return (
    <section className="app-updates" aria-labelledby="updates-title">
      <h3 id="updates-title">Mises à jour</h3>
      <p role="status">{message}</p>
      {manual && (
        <p className="update-hint">
          Cette édition se met à jour en téléchargeant la nouvelle version sur GitHub.
        </p>
      )}
      {actionError && (
        <p role="alert" className="update-error">
          {actionError}
        </p>
      )}
      <div className="update-actions">
        {status === 'available' && !manual && (
          <button
            type="button"
            className="button button-primary"
            onClick={() => void request(downloadUpdate)}
          >
            <ArrowDownToLine size={15} aria-hidden="true" />
            Télécharger la mise à jour
          </button>
        )}
        {status === 'downloaded' && (
          <button
            type="button"
            className="button button-primary"
            disabled={busy}
            onClick={() => void request(installUpdate)}
          >
            <RefreshCw size={15} aria-hidden="true" />
            Redémarrer et installer
          </button>
        )}
        {status !== 'downloaded' && status !== 'available' && (
          <button
            type="button"
            className="button button-secondary"
            disabled={!update || status === 'disabled' || working}
            onClick={() => void request(checkForUpdates)}
          >
            <RefreshCw
              size={15}
              className={status === 'checking' ? 'spinning' : ''}
              aria-hidden="true"
            />
            {status === 'checking' ? 'Recherche…' : 'Vérifier les mises à jour'}
          </button>
        )}
        <button
          type="button"
          className="text-button"
          onClick={() => void request(openUpdateRelease)}
        >
          <ExternalLink size={14} aria-hidden="true" />
          {manual && status === 'available'
            ? 'Télécharger sur GitHub'
            : 'Voir les versions sur GitHub'}
        </button>
      </div>
      {status === 'downloaded' && (
        <p className="update-hint">
          {busy
            ? 'Attendez la fin du traitement avant de redémarrer.'
            : 'Vous pouvez continuer à utiliser l’application et installer la mise à jour plus tard.'}
        </p>
      )}
    </section>
  );
}
