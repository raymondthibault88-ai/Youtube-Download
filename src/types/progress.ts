export interface ProgressState {
  percent?: number | null;
  raw?: string;
  speed?: string | null;
  eta?: string | null;
  stage?: 'video' | 'audio' | 'prepare' | 'convert' | 'finalize';
}
