import type { DependencyInfo } from "./deps";
import type { StartDownloadPayload } from "./download";
import type { ConversionResult, SelectedVideoFile, StartConversionPayload } from "./conversion";
import type { ProgressState } from "./progress";
import type { JobSnapshot } from "./job";
import type { VideoInfo } from "./video";

interface DesktopAPI {
  getStartupInfo: () => Promise<{ downloadsPath?: string }>;
  checkDependencies: () => Promise<DependencyInfo>;
  analyzeVideo: (url: string) => Promise<VideoInfo>;
  selectVideoFile: () => Promise<SelectedVideoFile | null>;
  selectOutputDir: () => Promise<string | null>;
  startDownload: (payload: StartDownloadPayload) => Promise<{ ok: boolean; outputPath: string }>;
  startConversion: (payload: StartConversionPayload) => Promise<ConversionResult>;
  getCurrentJob: () => Promise<JobSnapshot | null>;
  cancelJob: () => Promise<{ ok: boolean }>;
  revealPath: (targetPath: string) => Promise<{ ok: boolean; error?: string | null }>;
  onDownloadProgress: (handler: (payload: ProgressState) => void) => () => void;
  onConversionProgress: (handler: (payload: ProgressState) => void) => () => void;
  onJobUpdate: (handler: (payload: JobSnapshot) => void) => () => void;
}

declare global {
  interface Window {
    desktopAPI?: DesktopAPI;
  }
}

export {};
