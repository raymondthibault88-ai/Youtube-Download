import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentJob, onJobUpdate, startBatchDownload } from '../services/desktopApi';
import type { RunMediaJob } from './useMediaJob';
import type { JobSnapshot } from '../types/job';
import type { BatchItemResult, StartBatchDownloadPayload } from '../types/library';
import { getErrorMessage, isCancellationError } from '../utils/errors';

export default function useLibraryBatch(run: RunMediaJob, onError: (message: string) => void) {
  const [results, setResults] = useState<BatchItemResult[]>([]);
  const [starting, setStarting] = useState(false);
  const lastJob = useRef<string | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  const lastItem = useRef('');
  const resets = useRef(0);
  useEffect(() => {
    mounted.current = true;
    const initialReset = resets.current;
    let active = true;
    let received = false;
    const accept = (snapshot: JobSnapshot | null) => {
      if (!active || snapshot?.type !== 'batch') return;
      if (lastJob.current !== snapshot.id) {
        lastJob.current = snapshot.id;
        lastItem.current = '';
        setResults([]);
      }
      if (snapshot.result) setResults(snapshot.result.items);
      else if (snapshot.batchItem) {
        const item = snapshot.batchItem;
        const key = JSON.stringify([snapshot.id, item.id, item.state, item.outputPath, item.error]);
        if (lastItem.current === key) return;
        lastItem.current = key;
        setResults((current) => [...current.filter((entry) => entry.url !== item.url), item]);
      }
    };
    const unsubscribe = onJobUpdate((snapshot) => {
      received = true;
      accept(snapshot);
    });
    void getCurrentJob()
      .then((snapshot) => {
        if (!received && initialReset === resets.current) accept(snapshot);
      })
      .catch(() => {});
    return () => {
      active = false;
      mounted.current = false;
      unsubscribe();
    };
  }, []);
  const reset = useCallback(() => {
    resets.current += 1;
    lastJob.current = null;
    lastItem.current = '';
    setResults([]);
  }, []);
  const start = async (payload: StartBatchDownloadPayload) => {
    if (pending.current) return;
    pending.current = true;
    setStarting(true);
    setResults([]);
    onError('');
    try {
      const result = await run('batch', () => startBatchDownload(payload));
      if (mounted.current) setResults(result.items);
    } catch (error) {
      if (mounted.current && !isCancellationError(error))
        onError(getErrorMessage(error, 'Le téléchargement de la sélection n’a pas pu démarrer.'));
    } finally {
      pending.current = false;
      if (mounted.current) setStarting(false);
    }
  };
  return { results, starting, start, reset };
}
