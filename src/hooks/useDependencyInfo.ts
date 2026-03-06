import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DependencyInfo } from "../types/deps";
import { checkDependencies } from "../services/desktopApi";
import { getErrorMessage } from "../utils/errors";

const DEP_CACHE_KEY = "depsCache";
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
    try {
      const raw = window.localStorage.getItem(DEP_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed?.data || !parsed?.at) return;
      if (Date.now() - parsed.at > DEP_CACHE_TTL_MS) return;
      depsCacheAtRef.current = parsed.at;
      depsInfoRequestedRef.current = true;
      setDependencyInfo(parsed.data as DependencyInfo);
      setOutputDir((current) => current || parsed.data.downloadsPath || "");
    } catch {
      // Ignore cache errors.
    }
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
      try {
        window.localStorage.setItem(
          DEP_CACHE_KEY,
          JSON.stringify({ at: depsCacheAtRef.current, data: deps })
        );
      } catch {
        // Ignore storage failures.
      }
    } catch (error) {
      depsInfoRequestedRef.current = false;
      setError(getErrorMessage(error, "Impossible d'initialiser les dependances."));
    } finally {
      setIsChecking(false);
    }
  }, [setError, setOutputDir]);

  return { dependencyInfo, requestDependencyInfo, isChecking };
}
