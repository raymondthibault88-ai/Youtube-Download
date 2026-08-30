import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import downloadConfig from "../shared/download-config.json";
import { formatSize } from "../shared/formatters.js";
import logo from "./assets/logo.png";
import EmptyPanel from "./components/EmptyPanel";
import ConverterPanel from "./components/ConverterPanel";
import HeroPanel from "./components/HeroPanel";
import VideoPanel from "./components/VideoPanel";
import useDependencyInfo from "./hooks/useDependencyInfo";
import useDownloadFlow from "./hooks/useDownloadFlow";
import useDownloadProgress from "./hooks/useDownloadProgress";
import useMediaJob from "./hooks/useMediaJob";
import useSplash from "./hooks/useSplash";
import useStartupInfo from "./hooks/useStartupInfo";
import useVideoAnalyze from "./hooks/useVideoAnalyze";
import { getStoredOutputDir, pickOutputDir } from "./services/outputDirectory";
import { getCodecLabel } from "./utils/codecs";
import { getErrorMessage } from "./utils/errors";
import type { ProgressState, VideoFormat } from "./types";

export default function App() {
  const [mode, setMode] = useState<"download" | "convert">("download");
  const [url, setUrl] = useState("");
  const [outputDir, setOutputDir] = useState(() => getStoredOutputDir());
  const [progress, setProgress] = useState<ProgressState>({
    ...(downloadConfig.initialProgress as ProgressState)
  });
  const [error, setError] = useState("");
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const { job, cancel, busy } = useMediaJob();

  useDownloadProgress({ setProgress, setError });
  useSplash();
  useStartupInfo({ setOutputDir, setError });

  const { dependencyInfo, requestDependencyInfo, isChecking: isPreparingTools } = useDependencyInfo({
    setOutputDir,
    setError
  });

  const {
    video,
    loadingVideo,
    selectedFormat,
    setSelectedFormat,
    analyze
  } = useVideoAnalyze({ url, setError });

  const { downloading, handleManualDownload } = useDownloadFlow({
    url,
    outputDir,
    setOutputDir,
    progress,
    initialProgress: downloadConfig.initialProgress as ProgressState,
    setProgress,
    setError,
    dependencyInfo,
    requestDependencyInfo
  });

  useEffect(() => {
    void requestDependencyInfo();
  }, [requestDependencyInfo]);

  const handleSelectFormat = useCallback((format: VideoFormat) => {
    setSelectedFormat(format);
  }, [setSelectedFormat]);

  const handleUrlChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setUrl(event.target.value);
  }, []);

  const handleAnalyze = useCallback((event: FormEvent<HTMLFormElement>) => {
    analyze(event);
  }, [analyze]);

  const handlePickFolder = useCallback(async () => {
    try {
      const folder = await pickOutputDir();
      if (folder) {
        setOutputDir(folder);
      }
    } catch (errorCaught) {
      setError(getErrorMessage(errorCaught, "Impossible de sélectionner le dossier de sortie."));
    }
  }, [setOutputDir, setError]);


  const handlePasteUrl = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        urlInputRef.current?.focus();
      }
    } catch (errorCaught) {
      setError(getErrorMessage(errorCaught, "Impossible de lire le presse-papier."));
    }
  }, [setError]);

  const handleDownload = useCallback(() => {
    handleManualDownload(selectedFormat);
  }, [handleManualDownload, selectedFormat]);

  const availableFormats = useMemo(() => {
    return video?.formats || [];
  }, [video]);

  const progressPercent = useMemo(
    () => Math.max(0, Math.min(progress.percent || 0, 100)),
    [progress.percent]
  );
  const progressLabel = useMemo(
    () => progress.raw || "Aucun téléchargement en cours",
    [progress.raw]
  );
  const progressDetails = useMemo(
    () => [
      progress.speed ? `Vitesse: ${progress.speed}` : null,
      progress.eta ? `ETA: ${progress.eta}` : null
    ].filter(Boolean).join(" · "),
    [progress.speed, progress.eta]
  );

  const appStatus = downloading
    ? "Téléchargement en cours"
    : loadingVideo
      ? "Analyse en cours"
      : "Prêt";

  const selectedFormatSummary = useMemo(() => {
    if (!selectedFormat) return null;
    const mediaType = selectedFormat.hasVideo && selectedFormat.hasAudio
      ? "Vidéo + Audio"
      : selectedFormat.hasVideo
        ? "Vidéo seule"
        : "Audio seul";
    const videoCodecLabel = getCodecLabel(selectedFormat.videoCodec);
    const audioCodecLabel = selectedFormat.hasAudio
      ? getCodecLabel(selectedFormat.audioCodec)
      : selectedFormat.quickTimeCompatible
        ? "AAC"
        : null;
    const codecLabel = [videoCodecLabel, audioCodecLabel].filter(Boolean).join(" + ");
    const details = [
      selectedFormat.resolution,
      mediaType,
      selectedFormat.ext?.toUpperCase(),
      codecLabel || null,
      "Sortie compatible Dartfish (H.264/AAC)"
    ].filter(Boolean);
    const size = formatSize(selectedFormat.fileSizeText);
    return `${details.join(" · ")}${size ? ` · ${size}` : ""}`;
  }, [selectedFormat]);

  const actionLabel = loadingVideo ? "Analyse..." : "Analyser les formats";
  const progressMarker = Math.max(6, Math.min(progressPercent, 100));

  return (
    <main className="app-shell">
      <div className="app-glow" aria-hidden="true" />

      <div className="layout">
        <nav className="mode-switch" aria-label="Mode de l’application">
          <button className={mode === "download" ? "is-active" : ""} onClick={() => setMode("download")}>Télécharger YouTube</button>
          <button className={mode === "convert" ? "is-active" : ""} onClick={() => setMode("convert")}>Convertir une vidéo</button>
        </nav>

        {busy && job && (
          <div className="active-job" role="status">
            <div>
              <strong>{job.type === "download" ? "Téléchargement" : "Conversion"} · {Math.round(job.percent)}%</strong>
              <span>{job.raw}{job.eta ? ` · reste ${job.eta}` : ""}</span>
            </div>
            <button type="button" className="btn btn-subtle" onClick={() => void cancel()} disabled={job.state === "cancelling"}>
              {job.state === "cancelling" ? "Annulation…" : "Annuler"}
            </button>
          </div>
        )}

        <div hidden={mode !== "download"}>
          <HeroPanel
          appStatus={appStatus}
          url={url}
          onUrlChange={handleUrlChange}
          urlInputRef={urlInputRef}
          loadingVideo={loadingVideo}
          downloading={downloading}
          outputDir={outputDir}
          onAnalyze={handleAnalyze}
          onPasteUrl={handlePasteUrl}
          onPickFolder={handlePickFolder}
          actionLabel={actionLabel}
          dependencyInfo={dependencyInfo}
          progressLabel={progressLabel}
          progressPercent={progressPercent}
          progressMarker={progressMarker}
          progressDetails={progressDetails}
          isPreparingTools={isPreparingTools && !dependencyInfo}
          error={error}
          logoSrc={logo}
          />

          {video ? (
          <VideoPanel
            video={video}
            selectedFormatSummary={selectedFormatSummary}
            availableFormats={availableFormats}
            selectedFormatId={selectedFormat?.id || null}
            onSelectFormat={handleSelectFormat}
            onDownload={handleDownload}
            downloading={downloading}
          />
          ) : (
          <EmptyPanel />
          )}
        </div>
        <div hidden={mode !== "convert"}>
          <ConverterPanel outputDir={outputDir} onPickFolder={handlePickFolder} />
        </div>
      </div>
    </main>
  );
}
