import type { DependencyInfo } from './deps';
import type { DownloadResult, StartDownloadPayload } from './download';
import type { ConversionResult, SelectedVideoFile, StartConversionPayload } from './conversion';
import type { ProgressState } from './progress';
import type { JobSnapshot } from './job';
import type { VideoInfo } from './video';
import type { UpdateSnapshot } from './update';
import type {
  LibraryCollection,
  YouTubeAccountSnapshot,
  AccountPlaylistsPage,
  AccountVideosPage,
  StartBatchDownloadPayload,
  BatchDownloadResult
} from './library';

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
  importLibrary: (source: string) => Promise<LibraryCollection>;
  cancelLibraryImport: () => Promise<{ ok: boolean }>;
  startBatchDownload: (payload: StartBatchDownloadPayload) => Promise<BatchDownloadResult>;
  getYouTubeAccount: () => Promise<YouTubeAccountSnapshot>;
  connectYouTubeAccount: () => Promise<YouTubeAccountSnapshot>;
  cancelYouTubeAccount: () => Promise<{ ok: boolean }>;
  configureYouTubeAccount: () => Promise<YouTubeAccountSnapshot | null>;
  disconnectYouTubeAccount: () => Promise<YouTubeAccountSnapshot>;
  getAccountPlaylists: (pageToken?: string) => Promise<AccountPlaylistsPage>;
  getAccountVideos: (playlistId: string, pageToken?: string) => Promise<AccountVideosPage>;
  onYouTubeAccount: (handler: (payload: YouTubeAccountSnapshot) => void) => () => void;
}

declare global {
  interface Window {
    desktopAPI?: DesktopAPI;
  }
}

export {};
