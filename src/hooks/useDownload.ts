import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { DependencyInfo } from '../types/deps';
import type { RunMediaJob } from './useMediaJob';
import type useVideoAnalyze from './useVideoAnalyze';
import { startDownload } from '../services/desktopApi';
import { pickOutputDir } from '../services/outputDirectory';
import { getErrorMessage, isCancellationError } from '../utils/errors';

interface UseDownloadOptions {
  analysis: ReturnType<typeof useVideoAnalyze>;
  busy: boolean;
  outputDir: string;
  setOutputDir: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string>>;
  run: RunMediaJob;
  requestDependencyInfo: () => Promise<DependencyInfo | null>;
  onReveal: (filePath: string) => Promise<void>;
}
export default function useDownload({
  analysis,
  busy,
  outputDir,
  setOutputDir,
  setError,
  run,
  requestDependencyInfo,
  onReveal
}: UseDownloadOptions) {
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    const format = analysis.selectedFormat;
    if (!analysis.video || !format || busy || analysis.loadingVideo) return;
    const sourceUrl = analysis.url.trim();
    setError('');
    setDownloading(true);
    try {
      const result = await run('download', async () => {
        const tools = await requestDependencyInfo();
        const targetDir = outputDir || tools?.downloadsPath || (await pickOutputDir());
        if (!targetDir) {
          const cancelled = new Error('Opération annulée.');
          cancelled.name = 'AbortError';
          throw cancelled;
        }
        setOutputDir(targetDir);
        return startDownload({
          url: sourceUrl,
          outputDir: targetDir,
          formatId: format.id,
          mergeAudioIfNeeded: format.hasVideo && !format.hasAudio,
          hasVideo: format.hasVideo,
          hasAudio: format.hasAudio,
          shouldRecodeToMp4: format.ext?.toLowerCase() !== 'mp4' || !format.quickTimeCompatible
        });
      });
      await onReveal(result.outputPath);
    } catch (caught) {
      if (!isCancellationError(caught))
        setError(getErrorMessage(caught, 'Le téléchargement n’a pas pu aboutir.'));
    } finally {
      setDownloading(false);
    }
  };

  return { downloading, download };
}
