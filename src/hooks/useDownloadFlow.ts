import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DependencyInfo } from "../types/deps";
import type { ProgressState } from "../types/progress";
import type { VideoFormat } from "../types/video";
import { openPath, startDownload } from "../services/desktopApi";
import { pickOutputDir } from "../services/outputDirectory";
import { getErrorMessage } from "../utils/errors";

interface UseDownloadFlowParams {
  url: string;
  outputDir: string;
  setOutputDir: Dispatch<SetStateAction<string>>;
  progress: ProgressState;
  initialProgress: ProgressState;
  setProgress: Dispatch<SetStateAction<ProgressState>>;
  setError: Dispatch<SetStateAction<string>>;
  dependencyInfo: DependencyInfo | null;
  requestDependencyInfo: () => void;
}

export default function useDownloadFlow({
  url,
  outputDir,
  setOutputDir,
  progress,
  initialProgress,
  setProgress,
  setError,
  dependencyInfo,
  requestDependencyInfo
}: UseDownloadFlowParams) {
  const [downloading, setDownloading] = useState(false);
  const hasOpenedFolderRef = useRef(false);

  const resolveTargetDirectory = useCallback(async (forceAskOutput: boolean) => {
    if (forceAskOutput) {
      const pickedFolder = await pickOutputDir();
      if (!pickedFolder) {
        throw new Error("Téléchargement annulé: aucun dossier sélectionné.");
      }

      setOutputDir(pickedFolder);
      return pickedFolder;
    }

    const current = outputDir || dependencyInfo?.downloadsPath;
    if (current) {
      return current;
    }

    const pickedFolder = await pickOutputDir();
    if (!pickedFolder) {
      throw new Error("Sélectionne un dossier de sortie.");
    }

    setOutputDir(pickedFolder);
    return pickedFolder;
  }, [dependencyInfo?.downloadsPath, outputDir, setOutputDir]);

  const runDownload = useCallback(async (
    formatId: string,
    mergeAudioIfNeeded: boolean,
    forceAskOutput = false,
    hasVideo = true,
    hasAudio = true,
    shouldRecodeToMp4 = false
  ) => {
    if (!url.trim()) {
      setError("Colle une URL YouTube valide.");
      return;
    }

    setError("");
    setDownloading(true);
    setProgress({ ...initialProgress });

    try {
      const dependencyWarmupPromise = requestDependencyInfo();
      const targetDir = await resolveTargetDirectory(forceAskOutput);
      await dependencyWarmupPromise;

      await startDownload({
        url: url.trim(),
        outputDir: targetDir,
        formatId,
        mergeAudioIfNeeded,
        hasVideo,
        hasAudio,
        shouldRecodeToMp4
      });

      setProgress((previous) => ({ ...previous, percent: 100, raw: "Téléchargement terminé." }));
      hasOpenedFolderRef.current = false;
    } catch (error) {
      setError(getErrorMessage(error, "Le téléchargement a échoué."));
    } finally {
      setDownloading(false);
    }
  }, [
    initialProgress,
    requestDependencyInfo,
    resolveTargetDirectory,
    setError,
    setProgress,
    url
  ]);

  const handleManualDownload = useCallback(async (selectedFormat: VideoFormat | null) => {
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
      false,
      selectedFormat.hasVideo,
      selectedFormat.hasAudio,
      selectedFormat.ext?.toLowerCase() !== "mp4" || !selectedFormat.quickTimeCompatible
    );
  }, [runDownload, setError]);

  useEffect(() => {
    if (!progress?.raw || hasOpenedFolderRef.current) return;
    if (progress.percent && progress.percent >= 100) {
      const targetDir = outputDir || dependencyInfo?.downloadsPath;
      if (targetDir) {
        hasOpenedFolderRef.current = true;
        openPath(targetDir);
      }
    }
  }, [dependencyInfo?.downloadsPath, outputDir, progress.percent, progress.raw]);

  return {
    downloading,
    runDownload,
    handleManualDownload
  };
}
