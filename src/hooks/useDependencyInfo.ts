import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DependencyInfo } from "../types/deps";
import { checkDependencies } from "../services/desktopApi";
import { getErrorMessage } from "../utils/errors";

interface UseDependencyInfoParams {
  setOutputDir: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string>>;
}

export default function useDependencyInfo({ setOutputDir, setError }: UseDependencyInfoParams) {
  const [dependencyInfo, setDependencyInfo] = useState<DependencyInfo | null>(null);
  const depsInfoRequestedRef = useRef(false);

  const requestDependencyInfo = useCallback(async (): Promise<void> => {
    if (depsInfoRequestedRef.current) {
      return;
    }

    depsInfoRequestedRef.current = true;

    try {
      const deps = await checkDependencies();
      setDependencyInfo(deps);
      setOutputDir((current) => current || deps.downloadsPath || "");
    } catch (error) {
      setError(getErrorMessage(error, "Impossible d'initialiser les dépendances."));
    }
  }, [setError, setOutputDir]);

  useEffect(() => {
    if (dependencyInfo) {
      return undefined;
    }

    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const warmup = () => {
      requestDependencyInfo();
    };

    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(warmup, { timeout: 2000 });
    } else {
      timeoutId = setTimeout(warmup, 1200);
    }

    return () => {
      if (idleId !== null) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [dependencyInfo, requestDependencyInfo]);

  return { dependencyInfo, requestDependencyInfo };
}
