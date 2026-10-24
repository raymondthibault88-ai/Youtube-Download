import type { ConversionResult } from './conversion';
import type { DownloadResult } from './download';
import type { BatchDownloadResult, BatchProgress, BatchItemResult } from './library';

export type MediaOperation = 'download' | 'conversion' | 'batch';
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
  batch?: BatchProgress;
  batchItem?: BatchItemResult;
}

export type JobSnapshot = JobDetails &
  (
    | { type: 'download'; result: DownloadResult | null }
    | { type: 'conversion'; result: ConversionResult | null }
    | { type: 'batch'; result: BatchDownloadResult | null }
  );
