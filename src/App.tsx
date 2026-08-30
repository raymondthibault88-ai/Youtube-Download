import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import downloadConfig from "../shared/download-config.json";
import { formatSize } from "../shared/formatters.js";
import logo from "./assets/logo.png";
import EmptyPanel from "./components/EmptyPanel";
import AppHeader from "./components/AppHeader";
import ConverterPanel from "./components/ConverterPanel";
import HeroPanel from "./components/HeroPanel";
import JobBar from "./components/JobBar";
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
      selectedFormat.ext?.toUpperCase(),
      codecLabel || null,
      mediaType,
      selectedFormat.quickTimeCompatible ? "Conversion directe" : "Réencodage compatible"
    ].filter(Boolean);
    const size = formatSize(selectedFormat.fileSizeText);
    return `${details.join(" · ")}${size ? ` · ${size}` : ""}`;
  }, [selectedFormat]);

  const actionLabel = loadingVideo ? "Analyse..." : "Analyser les formats";
  const showJobBar = Boolean(job && ["running", "cancelling", "failed", "cancelled"].includes(job.state));
  const displayedJob = useMemo(() => {
    if (!job || job.type !== "download" || progress.percent == null || !progress.raw) return job;
    return {
      ...job,
      percent: Math.max(job.percent || 0, progress.percent),
      speed: progress.speed ?? job.speed,
      eta: progress.eta ?? job.eta,
      raw: progress.raw
    };
  }, [job, progress]);

  return (
    <main className="app-shell">
      <div className="app-glow" aria-hidden="true" />

      <div className="layout">
        <AppHeader
          mode={mode}
          onModeChange={setMode}
          logoSrc={logo}
          toolsReady={Boolean(dependencyInfo)}
          toolsPreparing={isPreparingTools}
        />

        {showJobBar && displayedJob && <JobBar job={displayedJob} onCancel={() => void cancel()} />}

        <div hidden={mode !== "download"}>
          <HeroPanel
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
            isPreparingTools={isPreparingTools && !dependencyInfo}
            error={error}
            mediaBusy={busy}
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
              mediaBusy={busy}
            />
          ) : (
            <EmptyPanel />
          )}
        </div>
        <div hidden={mode !== "convert"}>
          <ConverterPanel outputDir={outputDir} onPickFolder={handlePickFolder} mediaBusy={busy} />
        </div>
      </div>
    </main>
  );
}
