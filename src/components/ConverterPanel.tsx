import { useEffect, useMemo, useState } from "react";
import { formatBytes } from "../../shared/formatters.js";
import { onConversionProgress, revealPath, selectVideoFile, startConversion } from "../services/desktopApi";
import type { ConversionResult, ProgressState, SelectedVideoFile } from "../types";
import { getErrorMessage } from "../utils/errors";
import ProgressBlock from "./ui/ProgressBlock";

interface ConverterPanelProps {
  outputDir: string;
  onPickFolder: () => void;
}

export default function ConverterPanel({ outputDir, onPickFolder }: ConverterPanelProps) {
  const [file, setFile] = useState<SelectedVideoFile | null>(null);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState<ProgressState>({ percent: 0, raw: "Prêt à convertir" });
  const [error, setError] = useState("");
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [targetHeight, setTargetHeight] = useState<number | null>(null);
  const [profileId, setProfileId] = useState<"fast" | "balanced" | "compact">("fast");

  useEffect(() => {
    try {
      return onConversionProgress((payload) => setProgress((previous) => ({ ...previous, ...payload })));
    } catch (caughtError) {
      queueMicrotask(() => {
        setError(getErrorMessage(caughtError, "Le suivi de conversion est indisponible."));
      });
      return undefined;
    }
  }, []);

  const selectFile = async () => {
    try {
      const selected = await selectVideoFile();
      if (selected) {
        setFile(selected);
        setResult(null);
        setError("");
        setProgress({ percent: 0, raw: "Prêt à convertir" });
        setTargetHeight(null);
        setProfileId("fast");
      }
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "Impossible de sélectionner la vidéo."));
    }
  };

  const convert = async () => {
    if (!file) return;
    setConverting(true);
    setError("");
    setResult(null);
    setProgress({ percent: 0, raw: "Préparation de la conversion..." });

    try {
      const conversionResult = await startConversion({
        inputPath: file.path,
        outputDir,
        targetHeight,
        profileId
      });
      setResult(conversionResult);
      setProgress({ percent: 100, speed: null, eta: null, raw: "Conversion terminée." });
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "La conversion a échoué."));
    } finally {
      setConverting(false);
    }
  };

  const saving = useMemo(() => {
    if (!result || result.inputSize <= 0) return null;
    return Math.round((1 - (result.outputSize / result.inputSize)) * 100);
  }, [result]);
  const percent = Math.max(0, Math.min(progress.percent || 0, 100));
  const resolutionOptions = useMemo(() => {
    if (!file) return [];
    return file.outputOptions;
  }, [file]);
  const estimatedSize = useMemo(() => {
    return file?.outputOptions.find((option) => option.height === targetHeight)?.estimates[profileId] || null;
  }, [file, profileId, targetHeight]);

  return (
    <section className="panel converter-panel reveal-up">
      <div className="converter-head">
        <div>
          <span className="eyebrow">Nouveau · V3</span>
          <h2>Convertisseur vidéo rapide</h2>
          <p>Crée un MP4 H.264/AAC propre, compatible et plus léger, sans modifier l’original.</p>
        </div>
        <span className="status-chip">{converting ? "Conversion en cours" : "Prêt"}</span>
      </div>

      <div className="converter-grid">
        <div className="drop-card">
          <span className="file-icon" aria-hidden="true">▶</span>
          <strong>{file?.name || "Choisis une vidéo à convertir"}</strong>
          <span>{file ? `${formatBytes(file.size)} · ${file.width}×${file.height}` : "MP4, MOV, MKV, AVI, WebM, MTS…"}</span>
          <button type="button" className="btn btn-strong" onClick={selectFile} disabled={converting}>
            {file ? "Changer de vidéo" : "Sélectionner une vidéo"}
          </button>
        </div>

        <div className="converter-settings">
          {file && (
            <div>
              <span className="meta-label">Résolution de sortie</span>
              <div className="resolution-options">
                {resolutionOptions.map((option) => (
                  <button
                    type="button"
                    key={option.label}
                    className={targetHeight === option.height ? "is-active" : ""}
                    onClick={() => setTargetHeight(option.height)}
                    disabled={converting}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.height === null ? "Même définition" : `≈ ${formatBytes(option.estimates[profileId] || 0)}`}</span>
                  </button>
                ))}
              </div>
              <p className="size-estimate">
                Taille estimée : <strong>{estimatedSize ? `≈ ${formatBytes(estimatedSize)}` : "indisponible"}</strong>
                <span>Estimation indicative selon la durée et le débit cible.</span>
              </p>
            </div>
          )}
          {file && (
            <div>
              <span className="meta-label">Priorité d’encodage</span>
              <div className="resolution-options profile-options">
                {([
                  ["fast", "Rapide", "Accélération matérielle"],
                  ["balanced", "Équilibré", "Bon rapport taille/vitesse"],
                  ["compact", "Plus léger", "CPU, compression renforcée"]
                ] as const).map(([id, label, detail]) => (
                  <button type="button" key={id} className={profileId === id ? "is-active" : ""} onClick={() => setProfileId(id)} disabled={converting}>
                    <strong>{label}</strong><span>{detail}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="setting-row">
            <div>
              <strong>Profil intelligent</strong>
              <span>Accélération matérielle, avec repli automatique en mode rapide</span>
            </div>
            <span className="badge">Rapide & léger</span>
          </div>
          <div className="path-box" title={outputDir}>
            <span className="meta-label">Dossier de sortie</span>
            <span className="path-value">{outputDir || "Même dossier que la vidéo"}</span>
            <button type="button" className="link-btn" onClick={onPickFolder} disabled={converting}>Modifier</button>
          </div>
          <button type="button" className="btn btn-strong convert-button" onClick={convert} disabled={!file || converting}>
            {converting && <span className="btn-spinner" aria-hidden="true" />}
            {converting ? "Conversion…" : "Convertir en MP4 optimisé"}
          </button>
        </div>
      </div>

      <ProgressBlock
        progressLabel={progress.raw || "Prêt à convertir"}
        progressPercent={percent}
        progressMarker={Math.max(6, percent)}
        progressDetails={[
          progress.speed ? `Vitesse : ${progress.speed}` : null,
          progress.eta ? `Reste : ${progress.eta}` : null
        ].filter(Boolean).join(" · ")}
      />

      {result && (
        <div className="success-box">
          <div>
            <strong>Vidéo convertie avec succès</strong>
            <span>{formatBytes(result.inputSize)} → {formatBytes(result.outputSize)}{saving !== null ? ` · ${saving >= 0 ? `${saving}% plus léger` : "qualité privilégiée"}` : ""}</span>
          </div>
          <button type="button" className="btn btn-subtle" onClick={() => revealPath(result.outputPath)}>Afficher le fichier</button>
        </div>
      )}
      {error && <p className="error-box">{error}</p>}
    </section>
  );
}
