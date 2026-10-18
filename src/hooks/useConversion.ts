import { useState } from 'react';
import { selectVideoFile, startConversion } from '../services/desktopApi';
import type { SelectedVideoFile } from '../types';
import type { ConversionProfile } from '../types/conversion';
import type { RunMediaJob } from './useMediaJob';
import { getErrorMessage, isCancellationError } from '../utils/errors';

interface UseConversionOptions {
  outputDir: string;
  busy: boolean;
  run: RunMediaJob;
  onError: (message: string) => void;
  onSourceChange: () => void;
}

export default function useConversion({
  outputDir,
  busy,
  run,
  onError,
  onSourceChange
}: UseConversionOptions) {
  const [file, setFile] = useState<SelectedVideoFile | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [targetHeight, setTargetHeight] = useState<number | null>(null);
  const [profileId, setProfileId] = useState<ConversionProfile>('fast');
  const [converting, setConverting] = useState(false);
  const select = async () => {
    if (busy || selecting) return;
    setSelecting(true);
    onError('');
    try {
      const selected = await selectVideoFile();
      if (selected) {
        setFile(selected);
        setTargetHeight(null);
        setProfileId('fast');
        onSourceChange();
      }
    } catch (error) {
      onError(getErrorMessage(error, 'Impossible de lire ce fichier vidéo.'));
    } finally {
      setSelecting(false);
    }
  };
  const convert = async () => {
    if (!file || busy || selecting) return;
    setConverting(true);
    onError('');
    try {
      await run('conversion', () =>
        startConversion({ inputPath: file.path, outputDir, targetHeight, profileId })
      );
    } catch (error) {
      if (!isCancellationError(error))
        onError(getErrorMessage(error, 'La conversion n’a pas pu aboutir.'));
    } finally {
      setConverting(false);
    }
  };

  return {
    file,
    selecting,
    targetHeight,
    setTargetHeight,
    profileId,
    setProfileId,
    converting,
    select,
    convert
  };
}
