import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DependencyInfo } from "../types/deps";
import { checkDependencies } from "../services/desktopApi";
import { getErrorMessage } from "../utils/errors";
import { readJsonStorage, STORAGE_KEYS, writeJsonStorage } from "../utils/localStorage";
import packageInfo from "../../package.json";

const DEP_CACHE_TTL_MS = 10 * 60 * 1000;
const DEP_CACHE_KEY = `${STORAGE_KEYS.depsCache}:${packageInfo.version}`;

function readValidDependencyCache() {
  const cached = readJsonStorage<{ at: number; data: DependencyInfo }>(DEP_CACHE_KEY);
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
  const pendingRef = useRef<Promise<void> | null>(null);
  const depsCacheAtRef = useRef<number | null>(INITIAL_DEPENDENCY_CACHE?.at || null);

  const requestDependencyInfo = useCallback(async (): Promise<void> => {
    if (pendingRef.current) return pendingRef.current;
    if (depsCacheAtRef.current && Date.now() - depsCacheAtRef.current <= DEP_CACHE_TTL_MS) return;
    setIsChecking(true);
    const request = (async () => {
      try {
        let deps: DependencyInfo;
        try {
          deps = await checkDependencies();
        } catch (error) {
          if (!/TimeoutError|délai|ETIMEDOUT|ECONNRESET/.test(getErrorMessage(error, ""))) throw error;
          deps = await checkDependencies();
        }
        setDependencyInfo(deps);
        setOutputDir((current) => current || deps.downloadsPath || "");
        depsCacheAtRef.current = Date.now();
        writeJsonStorage(DEP_CACHE_KEY, { at: depsCacheAtRef.current, data: deps });
      } catch (error) {
        setError(getErrorMessage(error, "Impossible d'initialiser les dépendances."));
      } finally {
        pendingRef.current = null;
        setIsChecking(false);
      }
    })();
    pendingRef.current = request;
    return request;
  }, [setError, setOutputDir]);

  return { dependencyInfo, requestDependencyInfo, isChecking };
}
