import type { DependencyInfo } from './deps';
import type { StartDownloadPayload } from './download';
import type { ProgressState } from './progress';
import type { VideoInfo } from './video';

interface DesktopAPI {
  getStartupInfo: () => Promise<{ downloadsPath?: string }>;
  checkDependencies: () => Promise<DependencyInfo>;
  analyzeVideo: (url: string) => Promise<VideoInfo>;
  selectOutputDir: () => Promise<string | null>;
  startDownload: (payload: StartDownloadPayload) => Promise<{ ok: boolean }>;
  openPath: (targetPath: string) => Promise<{ ok: boolean; error?: string | null }>;
  onDownloadProgress: (handler: (payload: ProgressState) => void) => () => void;
}

declare global {
  interface Window {
    desktopAPI?: DesktopAPI;
  }
}

export {};
