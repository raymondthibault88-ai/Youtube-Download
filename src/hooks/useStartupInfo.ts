import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

interface UseStartupInfoParams {
  setOutputDir: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string>>;
}

export default function useStartupInfo({ setOutputDir, setError }: UseStartupInfoParams) {
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        if (!window.desktopAPI?.getStartupInfo) {
          return;
        }
        const info = await window.desktopAPI.getStartupInfo();
        if (cancelled) return;
        if (info?.downloadsPath) {
          setOutputDir((current) => current || info.downloadsPath || "");
        }
      } catch (initError) {
        if (cancelled) return;
        const message = initError instanceof Error
          ? initError.message
          : "Impossible d'initialiser l'application.";
        setError(message || "Impossible d'initialiser l'application.");
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [setError, setOutputDir]);
}
