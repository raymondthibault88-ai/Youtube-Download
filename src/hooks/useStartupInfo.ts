import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getStartupInfo } from "../services/desktopApi";
import { getErrorMessage } from "../utils/errors";

interface UseStartupInfoParams {
  setOutputDir: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string>>;
}

export default function useStartupInfo({ setOutputDir, setError }: UseStartupInfoParams) {
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const info = await getStartupInfo();
        if (cancelled) return;
        if (info?.downloadsPath) {
          setOutputDir((current) => current || info.downloadsPath || "");
        }
      } catch (error) {
        if (cancelled) return;
        setError(getErrorMessage(error, "Impossible d'initialiser l'application."));
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [setError, setOutputDir]);
}
