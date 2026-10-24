import type { ConversionResult } from './conversion';
import type { DownloadResult } from './download';

export type MediaOperation = 'download' | 'conversion';
export type JobState = 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed';

interface JobDetails {
  id: string;
  state: JobState;
  percent: number;
  speed: string | null;
  eta: string | null;
  raw: string;
  startedAt: number;
  updatedAt: number;
  error: string | null;
}

export type JobSnapshot = JobDetails &
  (
    | { type: 'download'; result: DownloadResult | null }
    | { type: 'conversion'; result: ConversionResult | null }
  );
