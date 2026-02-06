export interface VideoFormat {
  id: string;
  resolution?: string;
  ext?: string;
  fps?: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  fileSizeText?: string | null;
}

export interface VideoInfo {
  id?: string;
  title?: string;
  thumbnail?: string;
  duration?: number | null;
  uploader?: string;
  formats?: VideoFormat[];
}
