import { useEffect, useRef } from "react";
import packageInfo from "../../package.json";
import type { DependencyInfo } from "../types/deps";
import Icon from "./ui/Icon";

export default function AboutDialog({ open, onClose, dependencies, preparing, onRetry }: { open: boolean; onClose: () => void; dependencies: DependencyInfo | null; preparing: boolean; onRetry: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    else if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return <dialog ref={ref} className="about-dialog" aria-labelledby="about-title" onClose={onClose}>
    <div className="dialog-heading"><h2 id="about-title">À propos de YouTube Downloader</h2><button type="button" className="icon-button" aria-label="Fermer À propos" onClick={onClose}><Icon name="close" /></button></div>
    <p>Télécharger et convertir des vidéos en MP4 compatible.</p>
    <dl><div><dt>Version de l’application</dt><dd>{packageInfo.version}</dd></div>
      <div><dt>État des moteurs</dt><dd>{dependencies ? "Moteurs prêts" : preparing ? "Préparation en cours…" : "Initialisation nécessaire"}</dd></div>
      {dependencies && <><div><dt>yt-dlp</dt><dd>{dependencies.ytDlpVersion}</dd></div><div><dt>FFmpeg</dt><dd>{dependencies.ffmpegVersion}</dd></div></>}
    </dl>
    <p className="dialog-help">Affichage : utilisez le menu Affichage pour agrandir les textes, ou les raccourcis Ctrl/⌘ + et −. Ctrl/⌘ 0 rétablit la taille normale.</p>
    {!dependencies && <button type="button" className="btn btn-primary" disabled={preparing} onClick={onRetry}>{preparing ? "Préparation…" : "Réessayer l’initialisation"}</button>}
  </dialog>;
}
