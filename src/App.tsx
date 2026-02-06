import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import downloadConfig from "../shared/download-config.json";
import { formatSize } from "../shared/formatters.js";
import logo from "./assets/logo.png";
import EmptyPanel from "./components/EmptyPanel";
import HeroPanel from "./components/HeroPanel";
import VideoPanel from "./components/VideoPanel";
import useDependencyInfo from "./hooks/useDependencyInfo";
import useDownloadProgress from "./hooks/useDownloadProgress";
import useOutputDirStorage from "./hooks/useOutputDirStorage";
import useSplash from "./hooks/useSplash";
import useStartupInfo from "./hooks/useStartupInfo";
import type { ProgressState, VideoFormat, VideoInfo } from "./types/app";

export default function App() {
  const [url, setUrl] = useState("");
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<VideoFormat | null>(null);
  const [outputDir, setOutputDir] = useState("");
  const [progress, setProgress] = useState<ProgressState>({
    ...(downloadConfig.initialProgress as ProgressState)
  });
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const lastAnalyzeRef = useRef<{ url: string; data: VideoInfo | null }>({ url: "", data: null });
  const hasOpenedFolderRef = useRef(false);
  const urlInputRef = useRef<HTMLInputElement | null>(null);

  useOutputDirStorage(setOutputDir);
  useDownloadProgress({ setProgress, setError });
  useSplash();
  useStartupInfo({ setOutputDir, setError });

  const { dependencyInfo, requestDependencyInfo } = useDependencyInfo({
    setOutputDir,
    setError
  });

  const handleSelectFormat = useCallback((format: VideoFormat) => {
    setSelectedFormat(format);
  }, []);

  const handleUrlChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setUrl(event.target.value);
  }, []);

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      setError("Colle une URL YouTube valide.");
      return;
    }

    setLoadingVideo(true);
    setError("");
    setVideo(null);
    setSelectedFormat(null);

    try {
      if (lastAnalyzeRef.current.url === normalizedUrl && lastAnalyzeRef.current.data) {
        const cachedData = lastAnalyzeRef.current.data;
        setVideo(cachedData);
        const cachedBest = cachedData?.formats?.[0];
        if (cachedBest) {
          setSelectedFormat(cachedBest);
        }
        setLoadingVideo(false);
        return;
      }

      const data = await window.desktopAPI!.analyzeVideo(normalizedUrl);
      lastAnalyzeRef.current = { url: normalizedUrl, data };
      setVideo(data);
      const bestFormat = data?.formats?.[0];
      if (bestFormat) {
        setSelectedFormat(bestFormat);
      }
    } catch (analyzeError) {
      const message = analyzeError instanceof Error
        ? analyzeError.message
        : "Erreur pendant l'analyse de la vidéo.";
      setError(message || "Erreur pendant l'analyse de la vidéo.");
    } finally {
      setLoadingVideo(false);
    }
  }

  async function handlePickFolder() {
    try {
      const folder = await window.desktopAPI!.selectOutputDir();
      if (folder) {
        setOutputDir(folder);
        window.localStorage.setItem("outputDir", folder);
      }
    } catch (folderError) {
      const message = folderError instanceof Error
        ? folderError.message
        : "Impossible de sélectionner le dossier de sortie.";
      setError(message || "Impossible de sélectionner le dossier de sortie.");
    }
  }

  async function handlePasteUrl() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        urlInputRef.current?.focus();
      }
    } catch (pasteError) {
      const message = pasteError instanceof Error
        ? pasteError.message
        : "Impossible de lire le presse-papier.";
      setError(message || "Impossible de lire le presse-papier.");
    }
  }

  async function resolveTargetDirectory(forceAskOutput: boolean) {
    if (forceAskOutput) {
      const pickedFolder = await window.desktopAPI!.selectOutputDir();
      if (!pickedFolder) {
        throw new Error("Téléchargement annulé: aucun dossier sélectionné.");
      }

      setOutputDir(pickedFolder);
      window.localStorage.setItem("outputDir", pickedFolder);
      return pickedFolder;
    }

    const current = outputDir || dependencyInfo?.downloadsPath;
    if (current) {
      return current;
    }

    const pickedFolder = await window.desktopAPI!.selectOutputDir();
    if (!pickedFolder) {
      throw new Error("Sélectionne un dossier de sortie.");
    }

    setOutputDir(pickedFolder);
    window.localStorage.setItem("outputDir", pickedFolder);
    return pickedFolder;
  }

  async function runDownload(
    formatId: string,
    mergeAudioIfNeeded: boolean,
    forceAskOutput = false,
    hasVideo = true,
    hasAudio = true
  ) {
    if (!url.trim()) {
      setError("Colle une URL YouTube valide.");
      return;
    }

    setError("");
    setDownloading(true);
    setProgress({ ...downloadConfig.initialProgress } as ProgressState);

    try {
      requestDependencyInfo();
      const targetDir = await resolveTargetDirectory(forceAskOutput);

      await window.desktopAPI!.startDownload({
        url: url.trim(),
        outputDir: targetDir,
        formatId,
        mergeAudioIfNeeded,
        hasVideo,
        hasAudio
      });

      setProgress((previous) => ({ ...previous, percent: 100, raw: "Téléchargement terminé." }));
      hasOpenedFolderRef.current = false;
    } catch (downloadError) {
      const message = downloadError instanceof Error
        ? downloadError.message
        : "Le téléchargement a échoué.";
      setError(message || "Le téléchargement a échoué.");
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    if (video && !dependencyInfo) {
      requestDependencyInfo();
    }
  }, [video, dependencyInfo, requestDependencyInfo]);

  async function handleManualDownload() {
    if (!selectedFormat) {
      setError("Sélectionne un format.");
      return;
    }

    if (!selectedFormat.hasVideo) {
      setError("Mode MP4 uniquement: sélectionne un format vidéo.");
      return;
    }

    await runDownload(
      selectedFormat.id,
      selectedFormat.hasVideo && !selectedFormat.hasAudio,
      true,
      selectedFormat.hasVideo,
      selectedFormat.hasAudio
    );
  }

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

  useEffect(() => {
    if (!progress?.raw || hasOpenedFolderRef.current) return;
    if (progress.percent && progress.percent >= 100) {
      const targetDir = outputDir || dependencyInfo?.downloadsPath;
      if (targetDir) {
        hasOpenedFolderRef.current = true;
        window.desktopAPI!.openPath(targetDir);
      }
    }
  }, [progress, outputDir, dependencyInfo]);

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
            onDownload={handleManualDownload}
            downloading={downloading}
          />
        ) : (
          <EmptyPanel />
        )}
      </div>
    </main>
  );
}
