import { formatBytes } from "../../shared/formatters.js";
import type { JobSnapshot } from "../types/job";

export interface CompletedActivity {
  type: "download" | "conversion";
  outputPath: string;
  description: string;
  sizeSummary?: string;
}

export function fileName(filePath: string) {
  return filePath.split(/[\\/]/).pop() || filePath;
}

export function conversionSizeSummary(input: number, output: number) {
  const saving = input > 0 ? Math.round((1 - output / input) * 100) : null;
  return `${formatBytes(input) || "—"} → ${formatBytes(output) || "—"}${saving !== null && saving >= 0 ? ` · ${saving}% plus léger` : ""}`;
}

export function completedActivityFromJob(job: JobSnapshot | null): CompletedActivity | null {
  if (!job || job.state !== "completed" || job.type === "analysis" || !job.result || typeof job.result !== "object") return null;
  const result = job.result as Record<string, unknown>;
  if (result.ok !== true || typeof result.outputPath !== "string") return null;
  if (job.type === "download") return {
    type: "download", outputPath: result.outputPath,
    description: typeof result.description === "string" ? result.description : "MP4 compatible",
    sizeSummary: typeof result.outputSize === "number" ? formatBytes(result.outputSize) || undefined : undefined
  };
  const profiles: Record<string, string> = { fast: "Rapide", balanced: "Équilibré", compact: "Plus léger" };
  return {
    type: "conversion", outputPath: result.outputPath,
    description: [typeof result.sourceName === "string" ? `Source : ${result.sourceName}` : null, result.resolutionLabel, typeof result.profileId === "string" ? profiles[result.profileId] : null].filter(value => typeof value === "string").join(" · ") || "MP4 compatible",
    sizeSummary: typeof result.inputSize === "number" && typeof result.outputSize === "number" ? conversionSizeSummary(result.inputSize, result.outputSize) : undefined
  };
}
