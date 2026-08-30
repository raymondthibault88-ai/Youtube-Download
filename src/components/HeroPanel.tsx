import type { ChangeEvent, FormEvent, RefObject } from "react";
import type { DependencyInfo } from "../types/deps";

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
  error: string;
}

function getFfmpegVersion(rawVersion: string) {
  return rawVersion.match(/ffmpeg version\s+([^\s]+)/i)?.[1] || rawVersion.split(" ")[0];
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
  dependencyInfo,
  isPreparingTools,
  error
}: HeroPanelProps) {
  return (
    <section className="panel download-panel reveal-up">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Téléchargement</span>
          <h2>Récupérer une vidéo YouTube</h2>
          <p>Colle le lien, analyse les formats, puis choisis la qualité adaptée.</p>
        </div>
        {dependencyInfo && (
          <span className="version-pill" title={dependencyInfo.ffmpegVersion}>
            yt-dlp {dependencyInfo.ytDlpVersion} · FFmpeg {getFfmpegVersion(dependencyInfo.ffmpegVersion)}
          </span>
        )}
        {isPreparingTools && <span className="version-pill">Préparation des moteurs…</span>}
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
          />
          <button type="button" onClick={onPasteUrl} className="btn btn-ghost">Coller</button>
          <button type="submit" disabled={loadingVideo || downloading || mediaBusy || !url.trim()} className="btn btn-primary">
            {loadingVideo && <span className="btn-spinner" aria-hidden="true" />}
            {mediaBusy && !downloading ? "Tâche en cours" : actionLabel}
          </button>
        </div>

        <div className="destination-row">
          <span className="destination-icon" aria-hidden="true">⌁</span>
          <div title={outputDir || "Aucun dossier sélectionné"}>
            <span className="meta-label">Enregistrer dans</span>
            <strong>{outputDir || "Choisir un dossier"}</strong>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onPickFolder}>Modifier</button>
        </div>
      </form>

      {error && <p className="error-box">{error}</p>}
    </section>
  );
}
