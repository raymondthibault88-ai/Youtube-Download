import type { ChangeEvent, FormEvent, RefObject } from "react";
import type { DependencyInfo } from "../types/deps";
import Icon from "./ui/Icon";

interface HeroPanelProps {
  url: string;
  onUrlChange: (event: ChangeEvent<HTMLInputElement>) => void;
  urlInputRef: RefObject<HTMLInputElement | null>;
  loadingVideo: boolean;
  downloading: boolean;
  mediaBusy: boolean;
  outputDir: string;
  onAnalyze: (event: FormEvent<HTMLFormElement>) => void;
  onPasteUrl: () => void;
  onPickFolder: () => void;
  actionLabel: string;
  dependencyInfo: DependencyInfo | null;
  isPreparingTools: boolean;
}

export default function HeroPanel({
  url,
  onUrlChange,
  urlInputRef,
  loadingVideo,
  downloading,
  mediaBusy,
  outputDir,
  onAnalyze,
  onPasteUrl,
  onPickFolder,
  actionLabel,
  isPreparingTools
}: HeroPanelProps) {
  return (
    <section className="panel download-panel reveal-up">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Téléchargement</span>
          <h2>Récupérer une vidéo YouTube</h2>
          <p>Colle le lien, analyse les formats, puis choisis la qualité adaptée.</p>
        </div>
        {isPreparingTools && <span className="version-pill">Préparation…</span>}
      </div>

      <form className="download-form" onSubmit={onAnalyze}>
        <label className="field-label" htmlFor="url-input">Lien de la vidéo</label>
        <div className="url-control">
          <input
            id="url-input"
            type="url"
            required
            placeholder="https://www.youtube.com/watch?v=..."
            className="url-input"
            value={url}
            ref={urlInputRef}
            onChange={onUrlChange}
            disabled={downloading || (mediaBusy && !loadingVideo)}
          />
          <button type="button" onClick={onPasteUrl} disabled={downloading || (mediaBusy && !loadingVideo)} className="btn btn-ghost">Coller</button>
          <button type="submit" disabled={loadingVideo || downloading || mediaBusy || !url.trim()} className="btn btn-primary">
            {loadingVideo && <span className="btn-spinner" aria-hidden="true" />}
            {loadingVideo ? "Analyse…" : mediaBusy && !downloading ? "Tâche en cours" : actionLabel}
          </button>
        </div>

        <div className="destination-row">
          <span className="destination-icon"><Icon name="folder" /></span>
          <div title={outputDir || "Aucun dossier sélectionné"}>
            <span className="meta-label">Enregistrer dans</span>
            <strong>{outputDir || "Choisir un dossier"}</strong>
          </div>
          <button type="button" className="btn btn-ghost" disabled={mediaBusy || downloading} onClick={onPickFolder}>Modifier</button>
        </div>
      </form>

    </section>
  );
}
