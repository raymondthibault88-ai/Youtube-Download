interface AppHeaderProps {
  mode: "download" | "convert";
  onModeChange: (mode: "download" | "convert") => void;
  logoSrc: string;
  toolsReady: boolean;
  toolsPreparing: boolean;
}

export default function AppHeader({ mode, onModeChange, logoSrc, toolsReady, toolsPreparing }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-identity">
        <img src={logoSrc} alt="" className="app-logo" decoding="async" />
        <div>
          <h1>Video Studio</h1>
          <p>Télécharger et convertir, dans un seul espace</p>
        </div>
      </div>

      <nav className="mode-switch" aria-label="Mode de l’application">
        <button type="button" className={mode === "download" ? "is-active" : ""} onClick={() => onModeChange("download")}>
          Télécharger
        </button>
        <button type="button" className={mode === "convert" ? "is-active" : ""} onClick={() => onModeChange("convert")}>
          Convertir
        </button>
      </nav>

      <div className={`engine-status ${toolsReady ? "is-ready" : ""}`}>
        <span aria-hidden="true" />
        {toolsReady ? "Moteurs prêts" : toolsPreparing ? "Préparation…" : "Initialisation"}
      </div>
    </header>
  );
}
