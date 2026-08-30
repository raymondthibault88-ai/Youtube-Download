import { useCallback, useEffect, useState } from "react";
import { cancelJob, getCurrentJob, onJobUpdate } from "../services/desktopApi";
import type { JobSnapshot } from "../types/job";

export default function useMediaJob() {
  const [job, setJob] = useState<JobSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    void getCurrentJob().then((snapshot) => {
      if (active) setJob(snapshot);
    }).catch(() => {});
    const unsubscribe = onJobUpdate(setJob);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const cancel = useCallback(() => cancelJob(), []);
  return { job, cancel, busy: job?.state === "running" || job?.state === "cancelling" };
}
