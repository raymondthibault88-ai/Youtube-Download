import { useCallback, useEffect, useState } from "react";
import { cancelJob, getCurrentJob, onJobUpdate } from "../services/desktopApi";
import type { JobSnapshot } from "../types/job";

export default function useMediaJob() {
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const accept = (snapshot: JobSnapshot | null) => {
      if (active) setJob((current) => {
        if (!snapshot && current) return current;
        if (snapshot && current && (snapshot.startedAt < current.startedAt || (snapshot.id === current.id && snapshot.revision < current.revision))) return current;
        return snapshot;
      });
    };
    const unsubscribe = onJobUpdate(accept);
    void getCurrentJob().then(accept).catch(() => {});
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const cancel = useCallback(() => cancelJob(), []);
  const dismiss = useCallback(() => { if (job && job.state !== "running" && job.state !== "cancelling") setDismissedKey(`${job.id}:${job.startedAt}`); }, [job]);
  return { job: job && `${job.id}:${job.startedAt}` === dismissedKey ? null : job, cancel, dismiss, busy: job?.state === "running" || job?.state === "cancelling" };
}
