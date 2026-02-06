import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DependencyInfo } from "../types/deps";
import type { ProgressState } from "../types/progress";
import type { VideoFormat } from "../types/video";
import { openPath, selectOutputDir, startDownload } from "../services/desktopApi";
import { getErrorMessage } from "../utils/errors";

interface UseDownloadFlowParams {
  url: string;
  outputDir: string;
  setOutputDir: Dispatch<SetStateAction<string>>;
  progress: ProgressState;
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
  setProgress,
  setError,
  dependencyInfo,
  requestDependencyInfo
}: UseDownloadFlowParams) {
  const [downloading, setDownloading] = useState(false);
  const hasOpenedFolderRef = useRef(false);

  async function resolveTargetDirectory(forceAskOutput: boolean) {
    if (forceAskOutput) {
      const pickedFolder = await selectOutputDir();
      if (!pickedFolder) {
        throw new Error("Téléchargement annul?: aucun dossier sélectionné.");
      }

      setOutputDir(pickedFolder);
      window.localStorage.setItem("outputDir", pickedFolder);
      return pickedFolder;
    }

    const current = outputDir || dependencyInfo?.downloadsPath;
    if (current) {
      return current;
    }

    const pickedFolder = await selectOutputDir();
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
    setProgress((previous) => ({ ...previous, ...progress, percent: 0 }));

    try {
      requestDependencyInfo();
      const targetDir = await resolveTargetDirectory(forceAskOutput);

      await startDownload({
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
      const message = getErrorMessage(downloadError, "Le téléchargement a échoué.");
      setError(message);
    } finally {
      setDownloading(false);
    }
  }

  async function handleManualDownload(selectedFormat: VideoFormat | null) {
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

  useEffect(() => {
    if (!progress?.raw || hasOpenedFolderRef.current) return;
    if (progress.percent && progress.percent >= 100) {
      const targetDir = outputDir || dependencyInfo?.downloadsPath;
      if (targetDir) {
        hasOpenedFolderRef.current = true;
        openPath(targetDir);
      }
    }
  }, [progress, outputDir, dependencyInfo]);

  return {
    downloading,
    runDownload,
    handleManualDownload
  };
}
