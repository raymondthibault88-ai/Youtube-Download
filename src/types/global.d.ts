import type { DependencyInfo } from './deps';
import type { DownloadResult, StartDownloadPayload } from './download';
import type { ConversionResult, SelectedVideoFile, StartConversionPayload } from './conversion';
import type { ProgressState } from './progress';
import type { JobSnapshot } from './job';
import type { VideoInfo } from './video';
import type { UpdateSnapshot } from './update';

interface DesktopAPI {
  getStartupInfo: () => Promise<{ downloadsPath?: string }>;
  checkDependencies: () => Promise<DependencyInfo>;
  analyzeVideo: (url: string) => Promise<VideoInfo>;
  cancelVideoAnalysis: () => Promise<{ ok: boolean }>;
  readClipboard: () => Promise<string>;
  selectVideoFile: () => Promise<SelectedVideoFile | null>;
  selectOutputDir: () => Promise<string | null>;
  startDownload: (payload: StartDownloadPayload) => Promise<DownloadResult>;
  startConversion: (payload: StartConversionPayload) => Promise<ConversionResult>;
  getCurrentJob: () => Promise<JobSnapshot | null>;
  cancelJob: () => Promise<{ ok: boolean }>;
  revealPath: (targetPath: string) => Promise<{ ok: boolean; error?: string | null }>;
  getUpdateState: () => Promise<UpdateSnapshot>;
  checkForUpdates: () => Promise<UpdateSnapshot>;
  downloadUpdate: () => Promise<UpdateSnapshot>;
  installUpdate: () => Promise<UpdateSnapshot>;
  openUpdateRelease: () => Promise<{ ok: boolean }>;
  onUpdateState: (handler: (payload: UpdateSnapshot) => void) => () => void;
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
