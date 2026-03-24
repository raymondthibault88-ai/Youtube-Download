import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DependencyInfo } from "../types/deps";
import { checkDependencies } from "../services/desktopApi";
import { getErrorMessage } from "../utils/errors";
import { readJsonStorage, STORAGE_KEYS, writeJsonStorage } from "../utils/localStorage";

const DEP_CACHE_TTL_MS = 10 * 60 * 1000;

interface UseDependencyInfoParams {
  setOutputDir: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string>>;
}

export default function useDependencyInfo({ setOutputDir, setError }: UseDependencyInfoParams) {
  const [dependencyInfo, setDependencyInfo] = useState<DependencyInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const depsInfoRequestedRef = useRef(false);
  const depsCacheAtRef = useRef<number | null>(null);

  useEffect(() => {
    const parsed = readJsonStorage<{ at: number; data: DependencyInfo }>(STORAGE_KEYS.depsCache);
    if (!parsed?.data || !parsed?.at) return;
    if (Date.now() - parsed.at > DEP_CACHE_TTL_MS) return;
    depsCacheAtRef.current = parsed.at;
    depsInfoRequestedRef.current = true;
    setDependencyInfo(parsed.data);
    setOutputDir((current) => current || parsed.data.downloadsPath || "");
  }, [setOutputDir]);

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
