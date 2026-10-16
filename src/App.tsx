import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import downloadConfig from "../shared/download-config.json";
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
import { finalFormatSummary } from "./utils/formats";
import { completedActivityFromJob } from "./utils/results";
import type { CompletedActivity } from "./utils/results";
import ResultCard from "./components/ResultCard";
import Notice from "./components/ui/Notice";
import AboutDialog from "./components/AboutDialog";
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
  const { job, cancel, dismiss, busy } = useMediaJob();
  const [lastResult, setLastResult] = useState<CompletedActivity | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const onActivityStart = useCallback(() => { setLastResult(null); setError(""); dismiss(); }, [dismiss]);

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
    videoId: video?.id || null,
    outputDir,
    setOutputDir,
    onStart: onActivityStart,
    onCompleted: setLastResult,
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
    if (!busy && !downloading && !loadingVideo) setSelectedFormat(format);
  }, [setSelectedFormat, busy, downloading, loadingVideo]);

  const handleUrlChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setUrl(event.target.value);
  }, []);

  const handleAnalyze = useCallback((event: FormEvent<HTMLFormElement>) => {
    onActivityStart();
    analyze(event);
  }, [analyze, onActivityStart]);

  const handlePickFolder = useCallback(async () => {
    try {
      setError("");
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

  const selectedFormatSummary = selectedFormat ? finalFormatSummary(selectedFormat) : null;
  const completedResult = lastResult || completedActivityFromJob(job);
  const visibleError = error && !(job?.state === "failed" && error === getErrorMessage(job.error, "")) ? error : "";
  const dismissTask = () => { if (job?.state === "failed" && error === getErrorMessage(job.error, "")) setError(""); dismiss(); };

  const actionLabel = loadingVideo ? "Analyse..." : "Analyser les formats";
  const showJobBar = Boolean(job && ["running", "cancelling", "failed", "cancelled"].includes(job.state));
  const displayedJob = useMemo(() => {
    if (!job || job.state !== "running" || job.type !== "download" || progress.percent == null || !progress.raw) return job;
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
          onAbout={() => setAboutOpen(true)}
        />

        {visibleError && <Notice message={visibleError} onDismiss={() => setError("")} />}
        {showJobBar && displayedJob && <JobBar job={displayedJob} onCancel={() => { void cancel().catch(error => setError(getErrorMessage(error, "Impossible d’annuler la tâche."))); }} onDismiss={dismissTask} onReview={job?.type === "conversion" && mode !== "convert" ? () => setMode("convert") : job?.type !== "conversion" && mode !== "download" ? () => setMode("download") : undefined} />}
        {completedResult && <ResultCard result={completedResult} onError={setError} onDismiss={() => { setLastResult(null); if (job?.state === "completed") dismiss(); }} />}

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
              mediaBusy={busy || loadingVideo}
            />
          ) : (
            <EmptyPanel />
          )}
        </div>
        <div hidden={mode !== "convert"}>
          <ConverterPanel outputDir={outputDir} onPickFolder={handlePickFolder} mediaBusy={busy} onError={setError} onStart={onActivityStart} onCompleted={setLastResult} failed={job?.type === "conversion" && job.state === "failed"} />
        </div>
      </div>
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} dependencies={dependencyInfo} preparing={isPreparingTools} onRetry={() => { setError(""); void requestDependencyInfo(); }} />
    </main>
  );
}
