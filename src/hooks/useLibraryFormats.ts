import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeVideo, cancelVideoAnalysis } from '../services/desktopApi';
import type { VideoFormat, VideoInfo } from '../types';
import type { LibraryVideo } from '../types/library';
import { getErrorMessage, isCancellationError } from '../utils/errors';

export default function useLibraryFormats(onError: (message: string) => void) {
  const [editor, setEditor] = useState<{ video: LibraryVideo; info: VideoInfo | null } | null>(
    null
  );
  const [formats, setFormats] = useState<Record<string, VideoFormat>>({});
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const active = useRef(true);
  const pending = useRef(false);
  const close = useCallback(() => {
    request.current += 1;
    setEditor(null);
    setLoading(false);
    if (pending.current) {
      pending.current = false;
      void cancelVideoAnalysis().catch(() => {});
    }
  }, []);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      request.current += 1;
      if (pending.current) void cancelVideoAnalysis().catch(() => {});
    };
  }, []);
  const open = async (video: LibraryVideo) => {
    close();
    const token = ++request.current;
    pending.current = true;
    setEditor({ video, info: null });
    setLoading(true);
    onError('');
    try {
      const info = await analyzeVideo(video.url);
      if (!active.current || token !== request.current) return;
      if (!info.formats?.length) throw new Error('Aucune qualité disponible pour cette vidéo.');
      setEditor({ video, info });
    } catch (error) {
      if (active.current && token === request.current && !isCancellationError(error)) {
        onError(getErrorMessage(error, 'Impossible de récupérer les qualités de cette vidéo.'));
        setEditor(null);
      }
    } finally {
      if (active.current && token === request.current) {
        pending.current = false;
        setLoading(false);
      }
    }
  };
  const reset = useCallback(() => {
    close();
    setFormats({});
  }, [close]);
  const choose = (format: VideoFormat) => {
    if (editor) setFormats((current) => ({ ...current, [editor.video.id]: format }));
  };
  const selected = editor ? formats[editor.video.id] || null : null;
  return { editor, formats, loading, open, close, reset, choose, selected };
}
