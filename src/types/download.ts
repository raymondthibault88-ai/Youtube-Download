export interface StartDownloadPayload {
  url: string;
  outputDir: string;
  formatId: string;
  mergeAudioIfNeeded?: boolean;
  hasVideo?: boolean;
  hasAudio?: boolean;
}
