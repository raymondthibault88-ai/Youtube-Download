import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction, FormEvent } from "react";
import type { VideoFormat, VideoInfo } from "../types/video";
import { analyzeVideo } from "../services/desktopApi";
import { getErrorMessage, isCancelledError } from "../utils/errors";

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
  const [result, setResult] = useState<{ url: string; data: VideoInfo } | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [selection, setSelection] = useState<{ url: string; format: VideoFormat } | null>(null);
  const pendingRef = useRef(0);
  const normalizedUrl = url.trim();
  const video = result?.url === normalizedUrl ? result.data : null;
  const selectedFormat = video && selection?.url === normalizedUrl ? selection.format : null;
  const setSelectedFormat = useCallback((format: VideoFormat | null) => {
    setSelection(format ? { url: normalizedUrl, format } : null);
  }, [normalizedUrl]);

  const analyze = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      setError("Colle une URL YouTube valide.");
      return;
    }

    const request = ++pendingRef.current;
    setResult(null);
    setSelection(null);
    setLoadingVideo(true);
    setError("");

    try {
      const data = await analyzeVideo(normalizedUrl);
      if (request !== pendingRef.current) return;
      setResult({ url: normalizedUrl, data });
      const bestFormat = pickDefaultFormat(data?.formats);
      if (bestFormat) {
        setSelectedFormat(bestFormat);
      }
    } catch (error) {
      if (request !== pendingRef.current) return;
      setResult(null);
      setSelection(null);
      if (!isCancelledError(error)) setError(getErrorMessage(error, "Erreur pendant l'analyse de la vidéo."));
    } finally {
      if (request === pendingRef.current) setLoadingVideo(false);
    }
  }, [setError, setSelectedFormat, url]);

  return {
    video,
    loadingVideo,
    selectedFormat,
    setSelectedFormat,
    analyze
  };
}
