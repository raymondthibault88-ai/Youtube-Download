import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelJob, getCurrentJob, onJobUpdate } from '../services/desktopApi';
import type { JobSnapshot, MediaOperation } from '../types/job';

export type { MediaOperation } from '../types/job';
export type RunMediaJob = <T>(type: MediaOperation, operation: () => Promise<T>) => Promise<T>;
const isBusy = (job: JobSnapshot | null) => job?.state === 'running' || job?.state === 'cancelling';

export default function useMediaJob() {
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const [pendingType, setPendingType] = useState<MediaOperation | null>(null);
  const latest = useRef<JobSnapshot | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    let receivedUpdate = false;
    const accept = (snapshot: JobSnapshot | null) => {
      if (active) {
        latest.current = snapshot;
        setJob(snapshot);
      }
    };
    const unsubscribe = onJobUpdate((snapshot) => {
      receivedUpdate = true;
      accept(snapshot);
    });
    void getCurrentJob()
      .then((snapshot) => {
        if (!receivedUpdate) accept(snapshot);
      })
      .catch(() => {});
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const run: RunMediaJob = useCallback(async (type, operation) => {
    if (pending.current || isBusy(latest.current))
      throw new Error('Un traitement est déjà en cours. Attendez sa fin ou annulez-le.');
    pending.current = true;
    setPendingType(type);
    latest.current = null;
    setJob(null);
    try {
      return await operation();
    } finally {
      pending.current = false;
      setPendingType(null);
    }
  }, []);
  const clear = useCallback(() => {
    if (!pending.current && !isBusy(latest.current)) {
      latest.current = null;
      setJob(null);
    }
  }, []);
  const cancel = useCallback(() => cancelJob(), []);
  return { job, pendingType, run, clear, cancel, busy: pendingType !== null || isBusy(job) };
}
