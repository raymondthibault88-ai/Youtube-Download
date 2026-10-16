export type JobState = "running" | "cancelling" | "completed" | "cancelled" | "failed";

export interface JobSnapshot {
  id: string;
  type: "analysis" | "download" | "conversion";
  state: JobState;
  percent: number;
  speed: string | null;
  eta: string | null;
  raw: string;
  startedAt: number;
  updatedAt: number;
  revision: number;
  error: string | null;
  result: unknown;
}
