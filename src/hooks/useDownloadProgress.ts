import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ProgressState } from '../types/app';

interface UseDownloadProgressParams {
  setProgress: Dispatch<SetStateAction<ProgressState>>;
  setError: Dispatch<SetStateAction<string>>;
}

export default function useDownloadProgress({ setProgress, setError }: UseDownloadProgressParams) {
  useEffect(() => {
    if (!window.desktopAPI) {
      setError('Le bridge Electron (preload) est indisponible.');
      return undefined;
    }

    const unsubscribe = window.desktopAPI.onDownloadProgress((payload) => {
      setProgress((previous) => ({ ...previous, ...payload }));
    });

    return () => unsubscribe();
  }, [setError, setProgress]);
}
