export interface LibraryVideo {
  id: string;
  title: string;
  url: string;
  thumbnail: string | null;
  duration: number | null;
  available: boolean;
  reason?: string;
  privacyStatus?: string;
}

export interface LibraryCollection {
  id: string;
  title: string;
  sourceUrl: string;
  kind: 'playlist' | 'channel';
  items: LibraryVideo[];
  total: number;
  truncated: boolean;
  nextPageToken: string | null;
}

export interface YouTubeAccountSnapshot {
  configured: boolean;
  connected: boolean;
  connecting: boolean;
  channel: {
    id: string;
    title: string;
    thumbnail: string | null;
    uploadsPlaylistId: string;
  } | null;
  error: string | null;
}

export interface AccountPlaylist {
  id: string;
  title: string;
  thumbnail: string | null;
  videoCount: number;
}

export interface AccountPlaylistsPage {
  items: AccountPlaylist[];
  nextPageToken: string | null;
}

export interface AccountVideosPage {
  title?: string;
  items: LibraryVideo[];
  nextPageToken: string | null;
}

export interface BatchDownloadItem {
  id?: string;
  url: string;
  title?: string;
  formatId?: string;
}

export interface StartBatchDownloadPayload {
  items: BatchDownloadItem[];
  outputDir: string;
  targetHeight?: number | null;
}

export interface BatchProgress {
  total: number;
  index: number;
  completed: number;
  failed: number;
  currentTitle: string;
}

export interface BatchItemResult {
  id: string;
  url: string;
  title: string;
  state: 'completed' | 'failed' | 'cancelled';
  outputPath?: string;
  error?: string;
}

export interface BatchDownloadResult {
  ok: boolean;
  items: BatchItemResult[];
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
  outputPath?: string;
}
