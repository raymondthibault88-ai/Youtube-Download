import { useCallback, useRef, useState } from "react";
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
  const [isChecking, setIsChecking] = useState(false);
  const depsInfoRequestedRef = useRef(false);

  const requestDependencyInfo = useCallback(async (): Promise<void> => {
    if (depsInfoRequestedRef.current) {
      return;
    }

    depsInfoRequestedRef.current = true;
    setIsChecking(true);

    try {
      const deps = await checkDependencies();
      setDependencyInfo(deps);
      setOutputDir((current) => current || deps.downloadsPath || "");
    } catch (error) {
      setError(getErrorMessage(error, "Impossible d'initialiser les dépendances."));
    } finally {
      setIsChecking(false);
    }
  }, [setError, setOutputDir]);

  return { dependencyInfo, requestDependencyInfo, isChecking };
}
