import { Dialog } from '@base-ui/react/dialog';
import { useState } from 'react';
import { ArrowDownToLine, CircleHelp, RefreshCw, X } from 'lucide-react';
import { version } from '../../package.json';
import type { DependencyInfo } from '../types';
import BrandMark from './ui/BrandMark';
import AppUpdates from './AppUpdates';
import useAppUpdates from '../hooks/useAppUpdates';

export default function AboutDialog({
  info,
  checking,
  onCheck,
  busy
}: {
  info: DependencyInfo | null;
  checking: boolean;
  onCheck: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { update, actionError, request } = useAppUpdates();
  const available = update && ['available', 'downloading', 'downloaded'].includes(update.status);
  return (
    <>
      {available && (
        <button
          type="button"
          className="update-trigger"
          onClick={() => setOpen(true)}
          aria-label="Voir la mise à jour"
        >
          <ArrowDownToLine size={15} aria-hidden="true" />
          <span>
            {update.status === 'downloaded'
              ? 'Mise à jour prête'
              : update.status === 'downloading'
                ? `${Math.floor(update.percent)} %`
                : 'Mise à jour disponible'}
          </span>
        </button>
      )}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger className="about-trigger">
          <CircleHelp size={17} aria-hidden="true" />
          <span>À propos</span>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop className="dialog-backdrop" />
          <Dialog.Popup className="dialog-popup">
            <div className="dialog-top">
              <BrandMark className="brand-mark" />
              <Dialog.Close className="icon-button" aria-label="Fermer À propos">
                <X size={20} />
              </Dialog.Close>
            </div>
            <Dialog.Title className="dialog-title">YouTube Downloader</Dialog.Title>
            <Dialog.Description className="dialog-description">
              Version {version}
            </Dialog.Description>
            <AppUpdates update={update} actionError={actionError} request={request} busy={busy} />
            <div className="about-details">
              <h3>Outils</h3>
              <dl>
                <div>
                  <dt>yt-dlp</dt>
                  <dd>{info?.ytDlpVersion || 'À vérifier'}</dd>
                </div>
                <div>
                  <dt>FFmpeg</dt>
                  <dd>{info?.ffmpegVersion || 'À vérifier'}</dd>
                </div>
              </dl>
              <button
                type="button"
                className="button button-secondary"
                onClick={onCheck}
                disabled={checking}
              >
                <RefreshCw size={15} className={checking ? 'spinning' : ''} aria-hidden="true" />
                {checking ? 'Vérification…' : 'Vérifier les outils'}
              </button>
            </div>
            <p className="about-legal">
              Application indépendante, non affiliée à YouTube. Respectez les droits des vidéos.
              Licences incluses.
            </p>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
