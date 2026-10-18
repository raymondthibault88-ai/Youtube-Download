export type ConversionProfile = 'fast' | 'balanced' | 'compact';

export interface SelectedVideoFile {
  path: string;
  name: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  bitrate: number;
  outputOptions: Array<{
    height: number | null;
    label: string;
    estimates: Record<ConversionProfile, number | null>;
  }>;
}

export interface StartConversionPayload {
  inputPath: string;
  outputDir?: string;
  targetHeight?: number | null;
  profileId?: ConversionProfile;
}

export interface ConversionResult {
  ok: boolean;
  outputPath: string;
  inputSize: number;
  outputSize: number;
}
