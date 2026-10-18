import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { DependencyInfo } from '../types/deps';
import { checkDependencies } from '../services/desktopApi';
import { getErrorMessage } from '../utils/errors';
import { readJsonStorage, STORAGE_KEYS, writeJsonStorage } from '../utils/localStorage';

const CACHE_TTL = 10 * 60 * 1000;
export default function useDependencyInfo({
  setOutputDir,
  setError
}: {
  setOutputDir: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string>>;
}) {
  const [initial] = useState(() => {
    const cached = readJsonStorage<{ at: number; data: DependencyInfo }>(STORAGE_KEYS.depsCache);
    return cached?.data && Date.now() - cached.at < CACHE_TTL ? cached : null;
  });
  const [dependencyInfo, setDependencyInfo] = useState<DependencyInfo | null>(
    initial?.data || null
  );
  const [isChecking, setIsChecking] = useState(false);
  const cache = useRef(initial);
  const inFlight = useRef<Promise<DependencyInfo | null> | null>(null);
  const requestDependencyInfo = useCallback(
    (force = false): Promise<DependencyInfo | null> => {
      if (inFlight.current) return inFlight.current;
      if (!force && cache.current && Date.now() - cache.current.at < CACHE_TTL) {
        return Promise.resolve(cache.current.data);
      }
      setIsChecking(true);
      const promise = checkDependencies()
        .then((data) => {
          setDependencyInfo(data);
          setOutputDir((current) => current || data.downloadsPath || '');
          cache.current = { at: Date.now(), data };
          writeJsonStorage(STORAGE_KEYS.depsCache, cache.current);
          return data;
        })
        .catch((error) => {
          setError(
            getErrorMessage(
              error,
              'Les outils de téléchargement n’ont pas pu être préparés. Vous pouvez réessayer depuis À propos.'
            )
          );
          return null;
        })
        .finally(() => {
          setIsChecking(false);
          inFlight.current = null;
        });
      inFlight.current = promise;
      return promise;
    },
    [setError, setOutputDir]
  );
  return { dependencyInfo, isChecking, requestDependencyInfo };
}
