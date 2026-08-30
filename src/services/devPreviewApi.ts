import type { DependencyInfo } from "../types/deps";
import type { JobSnapshot } from "../types/job";
import type { SelectedVideoFile } from "../types/conversion";
import type { VideoInfo } from "../types/video";

const noopSubscription = () => () => {};

const dependencyInfo: DependencyInfo = {
  ytDlpPath: "/preview/yt-dlp",
  ytDlpVersion: "2026.08.19",
  ffmpegPath: "/preview/ffmpeg",
  ffmpegVersion: "ffmpeg version 6.0",
  downloadsPath: "/Users/preview/Vidéos"
};

const previewVideo: VideoInfo = {
  id: "preview",
  title: "Finale régionale · Analyse tactique",
  thumbnail: "https://i.ytimg.com/vi/u_aV3z1v4j8/hqdefault.jpg",
  duration: 5702,
  uploader: "Thibault Raymond",
  formats: [
    { id: "401", resolution: "3840×2160", ext: "webm", fps: 30, hasVideo: true, hasAudio: false, videoCodec: "vp9", audioCodec: null, quickTimeCompatible: false, fileSizeBytes: 8_800_000_000, fileSizeText: "8.8 GB" },
    { id: "400", resolution: "2560×1440", ext: "webm", fps: 30, hasVideo: true, hasAudio: false, videoCodec: "vp9", audioCodec: null, quickTimeCompatible: false, fileSizeText: "4.0 GB" },
    { id: "137", resolution: "1920×1080", ext: "mp4", fps: 30, hasVideo: true, hasAudio: false, videoCodec: "h264", audioCodec: null, quickTimeCompatible: true, fileSizeText: "1.9 GB" },
    { id: "136", resolution: "1280×720", ext: "mp4", fps: 30, hasVideo: true, hasAudio: false, videoCodec: "h264", audioCodec: null, quickTimeCompatible: true, fileSizeText: "970 MB" },
    { id: "135", resolution: "854×480", ext: "mp4", fps: 30, hasVideo: true, hasAudio: false, videoCodec: "h264", audioCodec: null, quickTimeCompatible: true, fileSizeText: "436 MB" }
  ]
};

const previewFile: SelectedVideoFile = {
  path: "/Users/preview/Match.mov",
  name: "Match complet.mov",
  size: 17_932_000_000,
  duration: 5702,
  width: 3840,
  height: 2160,
  bitrate: 20_000_000,
  outputOptions: [
    { height: null, label: "Original · 2160p", estimates: { fast: 8_800_000_000, balanced: 8_100_000_000, compact: 6_500_000_000 } },
    { height: 1440, label: "1440p", estimates: { fast: 5_800_000_000, balanced: 5_300_000_000, compact: 4_200_000_000 } },
    { height: 1080, label: "1080p", estimates: { fast: 3_700_000_000, balanced: 3_400_000_000, compact: 2_700_000_000 } },
    { height: 720, label: "720p", estimates: { fast: 1_900_000_000, balanced: 1_750_000_000, compact: 1_390_000_000 } },
    { height: 480, label: "480p", estimates: { fast: 990_000_000, balanced: 910_000_000, compact: 720_000_000 } }
  ]
};

export function getDevPreviewApi() {
  return {
    getStartupInfo: async () => ({ downloadsPath: dependencyInfo.downloadsPath }),
    checkDependencies: async () => dependencyInfo,
    analyzeVideo: async () => previewVideo,
    selectVideoFile: async () => previewFile,
    selectOutputDir: async (): Promise<string | null> => dependencyInfo.downloadsPath ?? null,
    startDownload: async () => ({ ok: true, outputPath: "/Users/preview/Vidéos/video.mp4" }),
    startConversion: async () => ({ ok: true, outputPath: "/Users/preview/Vidéos/video.mp4", inputSize: previewFile.size, outputSize: 3_700_000_000 }),
    getCurrentJob: async (): Promise<JobSnapshot | null> => null,
    cancelJob: async () => ({ ok: false }),
    revealPath: async () => ({ ok: true, error: null }),
    onDownloadProgress: () => noopSubscription(),
    onJobUpdate: () => noopSubscription()
  };
}
