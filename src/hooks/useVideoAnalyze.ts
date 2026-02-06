import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { VideoFormat, VideoInfo } from '../types/video';
import { analyzeVideo } from '../services/desktopApi';
import { getErrorMessage } from '../utils/errors';

interface UseVideoAnalyzeParams {
  url: string;
  setError: Dispatch<SetStateAction<string>>;
}

export default function useVideoAnalyze({ url, setError }: UseVideoAnalyzeParams) {
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<VideoFormat | null>(null);
  const lastAnalyzeRef = useRef<{ url: string; data: VideoInfo | null }>({ url: '', data: null });

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      setError('Colle une URL YouTube valide.');
      return;
    }

    setLoadingVideo(true);
    setError('');
    setVideo(null);
    setSelectedFormat(null);

    try {
      if (lastAnalyzeRef.current.url === normalizedUrl && lastAnalyzeRef.current.data) {
        const cachedData = lastAnalyzeRef.current.data;
        setVideo(cachedData);
        const cachedBest = cachedData?.formats?.[0];
        if (cachedBest) {
          setSelectedFormat(cachedBest);
        }
        setLoadingVideo(false);
        return;
      }

      const data = await analyzeVideo(normalizedUrl);
      lastAnalyzeRef.current = { url: normalizedUrl, data };
      setVideo(data);
      const bestFormat = data?.formats?.[0];
      if (bestFormat) {
        setSelectedFormat(bestFormat);
      }
    } catch (analyzeError) {
      const message = getErrorMessage(analyzeError, "Erreur pendant l'analyse de la vidéo.");
      setError(message);
    } finally {
      setLoadingVideo(false);
    }
  }

  return {
    video,
    loadingVideo,
    selectedFormat,
    setSelectedFormat,
    analyze
  };
}
