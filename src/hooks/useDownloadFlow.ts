import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DependencyInfo } from "../types/deps";
import type { ProgressState } from "../types/progress";
import type { VideoFormat } from "../types/video";
import { startDownload } from "../services/desktopApi";
import { pickOutputDir } from "../services/outputDirectory";
import { getErrorMessage, isCancelledError } from "../utils/errors";
import { finalFormatSummary } from "../utils/formats";
import { formatBytes } from "../../shared/formatters.js";
import type { CompletedActivity } from "../utils/results";

interface UseDownloadFlowParams {
  url: string;
  videoId: string | null;
  outputDir: string;
  setOutputDir: Dispatch<SetStateAction<string>>;
  initialProgress: ProgressState;
  setProgress: Dispatch<SetStateAction<ProgressState>>;
  setError: Dispatch<SetStateAction<string>>;
  dependencyInfo: DependencyInfo | null;
  requestDependencyInfo: () => void;
  onStart: () => void;
  onCompleted: (result: CompletedActivity) => void;
}

export default function useDownloadFlow({
  url,
  videoId,
  outputDir,
  setOutputDir,
  initialProgress,
  setProgress,
  setError,
  dependencyInfo,
  requestDependencyInfo,
  onStart,
  onCompleted
}: UseDownloadFlowParams) {
  const [downloading, setDownloading] = useState(false);

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
    shouldRecodeToMp4 = false,
    expectedSizeBytes: number | null = null,
    description = "MP4 compatible"
  ) => {
    if (!url.trim() || !videoId) {
      setError("Colle une URL YouTube valide.");
      return;
    }

    setError("");
    onStart();
    setDownloading(true);
    setProgress({ ...initialProgress });

    try {
      const dependencyWarmupPromise = requestDependencyInfo();
      const targetDir = await resolveTargetDirectory(forceAskOutput);
      await dependencyWarmupPromise;

      const result = await startDownload({
        url: url.trim(),
        videoId,
        outputDir: targetDir,
        formatId,
        mergeAudioIfNeeded,
        hasVideo,
        hasAudio,
        shouldRecodeToMp4,
        expectedSizeBytes
      });

      setProgress((previous) => ({ ...previous, percent: 100, raw: "Téléchargement terminé." }));
      onCompleted({ type: "download", outputPath: result.outputPath, description: result.description || description, sizeSummary: result.outputSize ? formatBytes(result.outputSize) || undefined : undefined });
    } catch (error) {
      if (!isCancelledError(error)) setError(getErrorMessage(error, "Le téléchargement a échoué."));
    } finally {
      setDownloading(false);
    }
  }, [
    initialProgress,
    requestDependencyInfo,
    resolveTargetDirectory,
    setError,
    setProgress,
    url,
    videoId,
    onStart,
    onCompleted
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
      selectedFormat.ext?.toLowerCase() !== "mp4" || !selectedFormat.quickTimeCompatible,
      selectedFormat.fileSizeBytes || null,
      finalFormatSummary(selectedFormat)
    );
  }, [runDownload, setError]);

  return {
    downloading,
    runDownload,
    handleManualDownload
  };
}
