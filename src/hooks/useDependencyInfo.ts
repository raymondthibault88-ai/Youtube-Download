import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DependencyInfo } from "../types/deps";
import { checkDependencies } from "../services/desktopApi";
import { getErrorMessage } from "../utils/errors";
import { readJsonStorage, STORAGE_KEYS, writeJsonStorage } from "../utils/localStorage";

const DEP_CACHE_TTL_MS = 10 * 60 * 1000;

function readValidDependencyCache() {
  const cached = readJsonStorage<{ at: number; data: DependencyInfo }>(STORAGE_KEYS.depsCache);
  return cached?.data && cached?.at && Date.now() - cached.at <= DEP_CACHE_TTL_MS
    ? cached
    : null;
}

const INITIAL_DEPENDENCY_CACHE = readValidDependencyCache();

interface UseDependencyInfoParams {
  setOutputDir: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string>>;
}

export default function useDependencyInfo({ setOutputDir, setError }: UseDependencyInfoParams) {
  const [dependencyInfo, setDependencyInfo] = useState<DependencyInfo | null>(
    () => INITIAL_DEPENDENCY_CACHE?.data || null
  );
  const [isChecking, setIsChecking] = useState(false);
  const depsInfoRequestedRef = useRef(Boolean(INITIAL_DEPENDENCY_CACHE));
  const depsCacheAtRef = useRef<number | null>(INITIAL_DEPENDENCY_CACHE?.at || null);

  const requestDependencyInfo = useCallback(async (): Promise<void> => {
    if (depsInfoRequestedRef.current) {
      if (depsCacheAtRef.current && Date.now() - depsCacheAtRef.current <= DEP_CACHE_TTL_MS) {
        return;
      }
      depsInfoRequestedRef.current = false;
    }

    if (depsInfoRequestedRef.current) {
      return;
    }

    depsInfoRequestedRef.current = true;
    setIsChecking(true);

    try {
      const deps = await checkDependencies();
      setDependencyInfo(deps);
      setOutputDir((current) => current || deps.downloadsPath || "");
      depsCacheAtRef.current = Date.now();
      writeJsonStorage(STORAGE_KEYS.depsCache, { at: depsCacheAtRef.current, data: deps });
    } catch (error) {
      depsInfoRequestedRef.current = false;
      setError(getErrorMessage(error, "Impossible d'initialiser les dependances."));
    } finally {
      setIsChecking(false);
    }
  }, [setError, setOutputDir]);

  return { dependencyInfo, requestDependencyInfo, isChecking };
}
