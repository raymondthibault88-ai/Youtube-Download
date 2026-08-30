export interface SelectedVideoFile {
  path: string;
  name: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  bitrate: number;
}

export interface StartConversionPayload {
  inputPath: string;
  outputDir?: string;
  targetHeight?: number | null;
  mediaInfo?: {
    duration: number;
    width: number;
    height: number;
    bitrate: number;
  };
}

export interface ConversionResult {
  ok: boolean;
  outputPath: string;
  inputSize: number;
  outputSize: number;
}
