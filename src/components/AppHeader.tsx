import Icon from "./ui/Icon";

interface AppHeaderProps {
  mode: "download" | "convert";
  onModeChange: (mode: "download" | "convert") => void;
  logoSrc: string;
  toolsReady: boolean;
  toolsPreparing: boolean;
  onAbout: () => void;
}

export default function AppHeader({ mode, onModeChange, logoSrc, toolsReady, toolsPreparing, onAbout }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-identity">
        <img src={logoSrc} alt="" className="app-logo" decoding="async" />
        <div>
          <h1>YouTube Downloader</h1>
          <p>Télécharger et convertir en MP4</p>
        </div>
      </div>

      <nav className="mode-switch" aria-label="Mode de l’application">
        <button type="button" aria-pressed={mode === "download"} className={mode === "download" ? "is-active" : ""} onClick={() => onModeChange("download")}>
          Télécharger
        </button>
        <button type="button" aria-pressed={mode === "convert"} className={mode === "convert" ? "is-active" : ""} onClick={() => onModeChange("convert")}>
          Convertir
        </button>
      </nav>

      <div className="header-tools">
      <div role="status" aria-label="État de l’application" className={`engine-status ${toolsReady ? "is-ready" : ""}`}>
        <span aria-hidden="true" />
        {toolsReady ? "Prêt" : toolsPreparing ? "Préparation…" : "À initialiser"}
      </div>
      <button type="button" className="icon-button" aria-label="À propos" onClick={onAbout}><Icon name="info" /></button>
      </div>
    </header>
  );
}
