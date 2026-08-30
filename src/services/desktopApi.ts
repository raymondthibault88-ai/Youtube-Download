import type { DependencyInfo } from "../types/deps";
import type { StartDownloadPayload } from "../types/download";
import type { ConversionResult, SelectedVideoFile, StartConversionPayload } from "../types/conversion";
import type { ProgressState } from "../types/progress";
import type { VideoInfo } from "../types/video";
import type { JobSnapshot } from "../types/job";

function getApi() {
  if (!window.desktopAPI) {
    throw new Error("Le bridge Electron (preload) est indisponible.");
  }

  return window.desktopAPI;
}

export function getStartupInfo() {
  return getApi().getStartupInfo();
}

export function checkDependencies(): Promise<DependencyInfo> {
  return getApi().checkDependencies();
}

export function analyzeVideo(url: string): Promise<VideoInfo> {
  return getApi().analyzeVideo(url);
}

export function selectOutputDir(): Promise<string | null> {
  return getApi().selectOutputDir();
}

export function selectVideoFile(): Promise<SelectedVideoFile | null> {
  return getApi().selectVideoFile();
}

export function startDownload(payload: StartDownloadPayload): Promise<{ ok: boolean; outputPath: string }> {
  return getApi().startDownload(payload);
}

export function startConversion(payload: StartConversionPayload): Promise<ConversionResult> {
  return getApi().startConversion(payload);
}

export function revealPath(targetPath: string): Promise<{ ok: boolean; error?: string | null }> {
  return getApi().revealPath(targetPath);
}

export function getCurrentJob(): Promise<JobSnapshot | null> {
  return getApi().getCurrentJob();
}

export function cancelJob(): Promise<{ ok: boolean }> {
  return getApi().cancelJob();
}

export function onJobUpdate(handler: (payload: JobSnapshot) => void) {
  return getApi().onJobUpdate(handler);
}

export function onDownloadProgress(handler: (payload: ProgressState) => void) {
  return getApi().onDownloadProgress(handler);
}

export function onConversionProgress(handler: (payload: ProgressState) => void) {
  return getApi().onConversionProgress(handler);
}
