import type { ChangeEvent, FormEvent, RefObject } from "react";
import type { DependencyInfo } from "../types/deps";
import ProgressBlock from "./ui/ProgressBlock";

interface HeroPanelProps {
  appStatus: string;
  url: string;
  onUrlChange: (event: ChangeEvent<HTMLInputElement>) => void;
  urlInputRef: RefObject<HTMLInputElement>;
  loadingVideo: boolean;
  downloading: boolean;
  outputDir: string;
  onAnalyze: (event: FormEvent<HTMLFormElement>) => void;
  onPasteUrl: () => void;
  onPickFolder: () => void;
  actionLabel: string;
  dependencyInfo: DependencyInfo | null;
  progressLabel: string;
  progressPercent: number;
  progressMarker: number;
  progressDetails: string;
  isPreparingTools: boolean;
  error: string;
  logoSrc: string;
}

export default function HeroPanel({
  appStatus,
  url,
  onUrlChange,
  urlInputRef,
  loadingVideo,
  downloading,
  outputDir,
  onAnalyze,
  onPasteUrl,
  onPickFolder,
  actionLabel,
  dependencyInfo,
  progressLabel,
  progressPercent,
  progressMarker,
  progressDetails,
  isPreparingTools,
  error,
  logoSrc
}: HeroPanelProps) {
  return (
    <section className="panel hero-panel reveal-up">
      <div className="hero-header">
        <div className="brand-block">
          <img src={logoSrc} alt="Logo YouTube Downloader" className="brand-logo" decoding="async" />
          <div>
            <h1>YouTube Downloader</h1>
            <p>Interface desktop simple pour Windows et macOS</p>
          </div>
        </div>
        <span className="status-chip">{appStatus}</span>
      </div>

      <form className="tool-form" onSubmit={onAnalyze}>
        <label className="field-label" htmlFor="url-input">URL vidéo</label>
        <div className="control-row">
          <div className="input-stack">
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
            <div className="action-row">
              <button
                type="submit"
                disabled={loadingVideo || downloading || !url.trim()}
                className={`btn btn-strong ${loadingVideo ? "is-loading" : ""}`}
              >
                {loadingVideo && <span className="btn-spinner" aria-hidden="true" />}
                {actionLabel}
              </button>

              <button
                type="button"
                onClick={onPasteUrl}
                className="btn btn-subtle"
              >
                Coller
              </button>

              <button
                type="button"
                onClick={onPickFolder}
                className="btn btn-subtle"
              >
                Choisir dossier
              </button>
            </div>
          </div>

          <div className="path-box compact" title={outputDir || "Aucun dossier sélectionné"}>
            <span className="meta-label">Destination</span>
            <span className="path-value">{outputDir || "Aucun dossier sélectionné"}</span>
            <button type="button" className="link-btn" onClick={onPickFolder}>
              Modifier
            </button>
          </div>
        </div>
      </form>

      <div className="meta-row">
        {dependencyInfo && (
          <div className="dep-box">
            <span>yt-dlp {dependencyInfo.ytDlpVersion}</span>
            <span>ffmpeg {dependencyInfo.ffmpegVersion}</span>
          </div>
        )}
        {isPreparingTools && !dependencyInfo && (
          <div className="dep-box">
            <span>Préparation des outils...</span>
          </div>
        )}
      </div>

      <ProgressBlock
        progressLabel={progressLabel}
        progressPercent={progressPercent}
        progressMarker={progressMarker}
        progressDetails={progressDetails}
      />

      {error && <p className="error-box">{error}</p>}
    </section>
  );
}
