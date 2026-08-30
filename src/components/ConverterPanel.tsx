import { useMemo, useState } from "react";
import { formatBytes } from "../../shared/formatters.js";
import { revealPath, selectVideoFile, startConversion } from "../services/desktopApi";
import type { ConversionResult, SelectedVideoFile } from "../types";
import { getErrorMessage } from "../utils/errors";

interface ConverterPanelProps {
  outputDir: string;
  onPickFolder: () => void;
  mediaBusy: boolean;
}

const PROFILES = [
  { id: "fast", label: "Rapide", detail: "Accélération matérielle" },
  { id: "balanced", label: "Équilibré", detail: "Taille et vitesse" },
  { id: "compact", label: "Plus léger", detail: "Compression renforcée" }
] as const;

export default function ConverterPanel({ outputDir, onPickFolder, mediaBusy }: ConverterPanelProps) {
  const [file, setFile] = useState<SelectedVideoFile | null>(null);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [targetHeight, setTargetHeight] = useState<number | null>(null);
  const [profileId, setProfileId] = useState<"fast" | "balanced" | "compact">("fast");
  const isLocked = converting || mediaBusy;

  const selectedResolution = file?.outputOptions.find((option) => option.height === targetHeight) || null;
  const selectedProfile = PROFILES.find((profile) => profile.id === profileId) || PROFILES[0];
  const estimatedSize = selectedResolution?.estimates[profileId] || null;
  const saving = useMemo(() => {
    if (!result || result.inputSize <= 0) return null;
    return Math.round((1 - (result.outputSize / result.inputSize)) * 100);
  }, [result]);

  const selectFile = async () => {
    try {
      const selected = await selectVideoFile();
      if (!selected) return;
      setFile(selected);
      setResult(null);
      setError("");
      setTargetHeight(null);
      setProfileId("fast");
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Impossible de sélectionner la vidéo."));
    }
  };

  const convert = async () => {
    if (!file) return;
    setConverting(true);
    setError("");
    setResult(null);
    try {
      setResult(await startConversion({ inputPath: file.path, outputDir, targetHeight, profileId }));
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "La conversion a échoué."));
    } finally {
      setConverting(false);
    }
  };

  return (
    <section className="panel converter-panel reveal-up">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Conversion locale</span>
          <h2>Créer un MP4 propre et plus léger</h2>
          <p>H.264/AAC compatible Dartfish, sans modifier le fichier original.</p>
        </div>
      </div>

      <div className={`source-card ${file ? "has-file" : ""}`}>
        <span className="source-icon" aria-hidden="true">▶</span>
        <div className="source-copy">
          <span className="meta-label">Fichier source</span>
          <strong>{file?.name || "Choisir une vidéo à convertir"}</strong>
          <p>{file ? `${formatBytes(file.size)} · ${file.width}×${file.height}` : "MP4, MOV, MKV, AVI, WebM, MTS…"}</p>
        </div>
        <button type="button" className={file ? "btn btn-ghost" : "btn btn-primary"} onClick={selectFile} disabled={isLocked}>
          {file ? "Changer" : "Sélectionner"}
        </button>
      </div>

      {file && (
        <div className="converter-workspace">
          <div className="setting-group">
            <div className="setting-heading">
              <span className="setting-step">1</span>
              <div><strong>Résolution</strong><span>Réduire la définition accélère la conversion</span></div>
            </div>
            <div className="resolution-options">
              {file.outputOptions.map((option) => (
                <button type="button" key={option.label} className={targetHeight === option.height ? "is-active" : ""} onClick={() => setTargetHeight(option.height)} disabled={isLocked}>
                  <strong>{option.height === null ? "Originale" : option.label}</strong>
                  <span>{option.height === null ? `${file.height}p` : `≈ ${formatBytes(option.estimates[profileId] || 0)}`}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="setting-group">
            <div className="setting-heading">
              <span className="setting-step">2</span>
              <div><strong>Priorité</strong><span>Choisir entre vitesse et poids final</span></div>
            </div>
            <div className="profile-options">
              {PROFILES.map((profile) => (
                <button type="button" key={profile.id} className={profileId === profile.id ? "is-active" : ""} onClick={() => setProfileId(profile.id)} disabled={isLocked}>
                  <strong>{profile.label}</strong>
                  <span>{profile.detail}</span>
                </button>
              ))}
            </div>
          </div>

          <aside className="output-summary">
            <span className="meta-label">Sortie prévue</span>
            <strong>{selectedResolution?.label || "Résolution originale"} · {selectedProfile.label}</strong>
            <p>{estimatedSize ? `Environ ${formatBytes(estimatedSize)}` : "Taille en cours d’estimation"}</p>
            <div className="output-path" title={outputDir}>
              <span>{outputDir || "Même dossier que la vidéo"}</span>
              <button type="button" className="link-btn" onClick={onPickFolder} disabled={isLocked}>Modifier</button>
            </div>
            <button type="button" className="btn btn-primary convert-button" onClick={convert} disabled={isLocked}>
              {isLocked && <span className="btn-spinner" aria-hidden="true" />}
              {converting
                ? "Conversion en cours"
                : mediaBusy
                  ? "Une tâche est en cours"
                  : "Convertir la vidéo"}
            </button>
          </aside>
        </div>
      )}

      {result && (
        <div className="success-box">
          <div>
            <strong>Vidéo prête</strong>
            <span>{formatBytes(result.inputSize)} → {formatBytes(result.outputSize)}{saving !== null && saving >= 0 ? ` · ${saving}% plus léger` : ""}</span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => revealPath(result.outputPath)}>Afficher le fichier</button>
        </div>
      )}
      {error && <p className="error-box">{error}</p>}
    </section>
  );
}
