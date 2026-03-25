import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction, FormEvent } from "react";
import type { VideoFormat, VideoInfo } from "../types/video";
import { analyzeVideo } from "../services/desktopApi";
import { getErrorMessage } from "../utils/errors";

interface UseVideoAnalyzeParams {
  url: string;
  setError: Dispatch<SetStateAction<string>>;
}

function pickDefaultFormat(formats?: VideoFormat[]) {
  if (!Array.isArray(formats) || formats.length === 0) {
    return null;
  }

  return formats.find((format) => format.quickTimeCompatible) || formats[0];
}

export default function useVideoAnalyze({ url, setError }: UseVideoAnalyzeParams) {
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<VideoFormat | null>(null);
  const lastAnalyzeRef = useRef<{ url: string; data: VideoInfo | null }>({ url: "", data: null });

  const analyze = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      setError("Colle une URL YouTube valide.");
      return;
    }

    setLoadingVideo(true);
    setError("");

    try {
      if (lastAnalyzeRef.current.url === normalizedUrl && lastAnalyzeRef.current.data) {
        const cachedData = lastAnalyzeRef.current.data;
        setVideo(cachedData);
        const cachedBest = pickDefaultFormat(cachedData?.formats);
        if (cachedBest) {
          setSelectedFormat(cachedBest);
        }
        setLoadingVideo(false);
        return;
      }

      const data = await analyzeVideo(normalizedUrl);
      lastAnalyzeRef.current = { url: normalizedUrl, data };
      setVideo(data);
      const bestFormat = pickDefaultFormat(data?.formats);
      if (bestFormat) {
        setSelectedFormat(bestFormat);
      }
    } catch (error) {
      setVideo(null);
      setSelectedFormat(null);
      setError(getErrorMessage(error, "Erreur pendant l'analyse de la vidéo."));
    } finally {
      setLoadingVideo(false);
    }
  }, [setError, url]);

  return {
    video,
    loadingVideo,
    selectedFormat,
    setSelectedFormat,
    analyze
  };
}
