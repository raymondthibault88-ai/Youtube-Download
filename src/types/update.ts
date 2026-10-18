export interface UpdateSnapshot {
  mode: "automatic" | "manual" | "disabled";
  status: "disabled" | "idle" | "checking" | "not-available" | "available" | "downloading" | "downloaded" | "installing" | "error";
  currentVersion: string;
  version: string | null;
  percent: number;
  error: string | null;
  checkedAt: number | null;
}
