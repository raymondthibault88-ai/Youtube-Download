export interface StartDownloadPayload {
  url: string;
  videoId: string;
  outputDir: string;
  formatId: string;
  mergeAudioIfNeeded?: boolean;
  hasVideo?: boolean;
  hasAudio?: boolean;
  shouldRecodeToMp4?: boolean;
  expectedSizeBytes?: number | null;
}
