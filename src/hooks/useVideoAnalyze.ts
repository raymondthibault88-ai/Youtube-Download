import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { analyzeVideo, cancelVideoAnalysis } from '../services/desktopApi';
import type { VideoFormat, VideoInfo } from '../types';
import { getErrorMessage, isCancellationError } from '../utils/errors';
import youtubeConfig from '../../shared/youtube-config.json';

export default function useVideoAnalyze({
  setError
}: {
  setError: Dispatch<SetStateAction<string>>;
}) {
  const [url, setUrlState] = useState('');
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<VideoFormat | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const request = useRef(0);
  const pending = useRef(false);
  const currentUrl = useRef('');
  const cache = useRef<{ url: string; at: number; data: VideoInfo } | null>(null);
  const cancelAnalysis = useCallback(() => {
    request.current += 1;
    setLoadingVideo(false);
    if (pending.current) {
      pending.current = false;
      void cancelVideoAnalysis().catch(() => {});
    }
  }, []);
  const setUrl = useCallback(
    (next: string) => {
      if (next.trim() !== currentUrl.current.trim()) {
        cancelAnalysis();
        setVideo(null);
        setSelectedFormat(null);
        setError('');
      }
      currentUrl.current = next;
      setUrlState(next);
    },
    [cancelAnalysis, setError]
  );
  useEffect(
    () => () => {
      request.current += 1;
      if (pending.current) void cancelVideoAnalysis().catch(() => {});
    },
    []
  );
  const analyze = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      const source = currentUrl.current.trim();
      if (!source) return;
      try {
        const parsed = new URL(source);
        if (parsed.protocol !== 'https:' || !youtubeConfig.allowedHosts.includes(parsed.hostname))
          throw new Error();
      } catch {
        setError('Utilisez un lien HTTPS provenant de youtube.com ou youtu.be.');
        return;
      }
      const token = ++request.current;
      pending.current = true;
      setLoadingVideo(true);
      setVideo(null);
      setSelectedFormat(null);
      setError('');
      try {
        const cached = cache.current;
        const data =
          cached?.url === source && Date.now() - cached.at < youtubeConfig.analysisCacheTtlMs
            ? cached.data
            : await analyzeVideo(source);
        if (request.current !== token || currentUrl.current.trim() !== source) return;
        if (!data.formats?.length) throw new Error('Aucune qualité vidéo disponible pour ce lien.');
        cache.current = { url: source, at: Date.now(), data };
        setVideo(data);
        setSelectedFormat(
          data.formats.find((format) => format.quickTimeCompatible) || data.formats[0]
        );
      } catch (error) {
        if (request.current === token && !isCancellationError(error))
          setError(getErrorMessage(error, 'Impossible de lire les informations de cette vidéo.'));
      } finally {
        if (request.current === token) {
          pending.current = false;
          setLoadingVideo(false);
        }
      }
    },
    [setError]
  );
  return {
    url,
    setUrl,
    video,
    selectedFormat,
    setSelectedFormat,
    loadingVideo,
    analyze,
    cancelAnalysis
  };
}
