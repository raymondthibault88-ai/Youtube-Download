import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import downloadConfig from "../shared/download-config.json";
import { formatSize } from "../shared/formatters.js";
import logo from "./assets/logo.png";
import EmptyPanel from "./components/EmptyPanel";
import HeroPanel from "./components/HeroPanel";
import VideoPanel from "./components/VideoPanel";
import useDependencyInfo from "./hooks/useDependencyInfo";
import useDownloadFlow from "./hooks/useDownloadFlow";
import useDownloadProgress from "./hooks/useDownloadProgress";
import useOutputDirStorage from "./hooks/useOutputDirStorage";
import useSplash from "./hooks/useSplash";
import useStartupInfo from "./hooks/useStartupInfo";
import useVideoAnalyze from "./hooks/useVideoAnalyze";
import { selectOutputDir } from "./services/desktopApi";
import { getErrorMessage } from "./utils/errors";
import type { ProgressState, VideoFormat } from "./types";

export default function App() {
  const [url, setUrl] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [progress, setProgress] = useState<ProgressState>({
    ...(downloadConfig.initialProgress as ProgressState)
  });
  const [error, setError] = useState("");
  const urlInputRef = useRef<HTMLInputElement | null>(null);

  useOutputDirStorage(setOutputDir);
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

  const handleSelectFormat = useCallback((format: VideoFormat) => {
    setSelectedFormat(format);
  }, [setSelectedFormat]);

  const handleUrlChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setUrl(event.target.value);
  }, []);

  const handleAnalyze = useCallback((event: FormEvent<HTMLFormElement>) => {
    if (!dependencyInfo && !isPreparingTools) {
      requestDependencyInfo();
    }
    analyze(event);
  }, [analyze, dependencyInfo, isPreparingTools, requestDependencyInfo]);

  const handlePickFolder = useCallback(async () => {
    try {
      const folder = await selectOutputDir();
      if (folder) {
        setOutputDir(folder);
        window.localStorage.setItem("outputDir", folder);
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

  useEffect(() => {
    if (video && !dependencyInfo) {
      requestDependencyInfo();
    }
  }, [video, dependencyInfo, requestDependencyInfo]);

  const availableFormats = useMemo(() => {
    const formats = video?.formats || [];
    return formats.filter((format) => format.hasVideo);
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
    const details = [
      selectedFormat.resolution,
      mediaType,
      selectedFormat.ext?.toUpperCase()
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
    </main>
  );
}
