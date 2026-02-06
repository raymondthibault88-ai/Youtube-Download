import type { DependencyInfo } from "../types/deps";
import type { StartDownloadPayload } from "../types/download";
import type { ProgressState } from "../types/progress";
import type { VideoInfo } from "../types/video";

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

export function startDownload(payload: StartDownloadPayload): Promise<{ ok: boolean }> {
  return getApi().startDownload(payload);
}

export function openPath(targetPath: string): Promise<{ ok: boolean; error?: string | null }> {
  return getApi().openPath(targetPath);
}

export function onDownloadProgress(handler: (payload: ProgressState) => void) {
  return getApi().onDownloadProgress(handler);
}
