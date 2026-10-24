import type { DependencyInfo } from '../types/deps';
import type { DownloadResult, StartDownloadPayload } from '../types/download';
import type {
  ConversionResult,
  SelectedVideoFile,
  StartConversionPayload
} from '../types/conversion';
import type { VideoInfo } from '../types/video';
import type { JobSnapshot } from '../types/job';
import type { UpdateSnapshot } from '../types/update';
import type { YouTubeAccountSnapshot, StartBatchDownloadPayload } from '../types/library';

function getApi() {
  if (!window.desktopAPI) {
    throw new Error('Le bridge Electron (preload) est indisponible.');
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

export function cancelVideoAnalysis(): Promise<{ ok: boolean }> {
  return getApi().cancelVideoAnalysis();
}

export function readClipboard(): Promise<string> {
  return getApi().readClipboard();
}

export function selectOutputDir(): Promise<string | null> {
  return getApi().selectOutputDir();
}

export function selectVideoFile(): Promise<SelectedVideoFile | null> {
  return getApi().selectVideoFile();
}

export function startDownload(payload: StartDownloadPayload): Promise<DownloadResult> {
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

export function getUpdateState(): Promise<UpdateSnapshot> {
  return getApi().getUpdateState();
}
export function checkForUpdates(): Promise<UpdateSnapshot> {
  return getApi().checkForUpdates();
}
export function downloadUpdate(): Promise<UpdateSnapshot> {
  return getApi().downloadUpdate();
}
export function installUpdate(): Promise<UpdateSnapshot> {
  return getApi().installUpdate();
}
export function openUpdateRelease(): Promise<{ ok: boolean }> {
  return getApi().openUpdateRelease();
}
export function onUpdateState(handler: (payload: UpdateSnapshot) => void) {
  return getApi().onUpdateState(handler);
}

export function importLibrary(source: string) {
  return getApi().importLibrary(source);
}
export function cancelLibraryImport() {
  return getApi().cancelLibraryImport();
}
export function startBatchDownload(payload: StartBatchDownloadPayload) {
  return getApi().startBatchDownload(payload);
}
export function getYouTubeAccount() {
  return getApi().getYouTubeAccount();
}
export function connectYouTubeAccount() {
  return getApi().connectYouTubeAccount();
}
export function cancelYouTubeAccount() {
  return getApi().cancelYouTubeAccount();
}
export function configureYouTubeAccount() {
  return getApi().configureYouTubeAccount();
}
export function disconnectYouTubeAccount() {
  return getApi().disconnectYouTubeAccount();
}
export function getAccountPlaylists(pageToken?: string) {
  return getApi().getAccountPlaylists(pageToken);
}
export function getAccountVideos(playlistId: string, pageToken?: string) {
  return getApi().getAccountVideos(playlistId, pageToken);
}
export function onYouTubeAccount(handler: (payload: YouTubeAccountSnapshot) => void) {
  return getApi().onYouTubeAccount(handler);
}
