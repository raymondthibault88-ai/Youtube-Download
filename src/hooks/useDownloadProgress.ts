import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ProgressState } from "../types/progress";
import { onDownloadProgress } from "../services/desktopApi";
import { getErrorMessage } from "../utils/errors";

interface UseDownloadProgressParams {
  setProgress: Dispatch<SetStateAction<ProgressState>>;
  setError: Dispatch<SetStateAction<string>>;
}

export default function useDownloadProgress({ setProgress, setError }: UseDownloadProgressParams) {
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    try {
      unsubscribe = onDownloadProgress((payload) => {
        setProgress((previous) => {
          const next = { ...previous, ...payload };
          if (
            previous.percent === next.percent
            && previous.speed === next.speed
            && previous.eta === next.eta
            && previous.raw === next.raw
          ) {
            return previous;
          }
          return next;
        });
      });
    } catch (error) {
      setError(getErrorMessage(error, "Le bridge Electron (preload) est indisponible."));
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [setError, setProgress]);
}
