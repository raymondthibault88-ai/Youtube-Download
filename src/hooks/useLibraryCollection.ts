import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelLibraryImport, getAccountVideos, importLibrary } from '../services/desktopApi';
import type { LibraryCollection, LibraryVideo } from '../types/library';
import { getErrorMessage, isCancellationError } from '../utils/errors';
import { maxBatchItems } from '../../shared/library-config.json';

interface Options {
  busy: boolean;
  onError: (message: string) => void;
  onSourceChange: () => void;
}

export default function useLibraryCollection({ busy, onError, onSourceChange }: Options) {
  const [source, setSourceState] = useState('');
  const [collection, setCollection] = useState<LibraryCollection | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetHeight, setTargetHeight] = useState<number | null>(null);
  const request = useRef(0);
  const origin = useRef<'public' | 'account'>('public');
  const mounted = useRef(true);
  const pending = useRef(false);
  const pendingOrigin = useRef<'public' | 'account' | null>(null);
  const cancel = useCallback(() => {
    request.current += 1;
    setLoading(false);
    pendingOrigin.current = null;
    if (pending.current) {
      pending.current = false;
      void cancelLibraryImport().catch(() => {});
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current += 1;
      if (pending.current) void cancelLibraryImport().catch(() => {});
    };
  }, []);
  const reset = useCallback(() => {
    cancel();
    origin.current = 'public';
    setCollection(null);
    setSelected(new Set());
    setQuery('');
  }, [cancel]);
  const setSource = (value: string) => {
    if (value.trim() !== source.trim()) {
      reset();
      onSourceChange();
      onError('');
    }
    setSourceState(value);
  };
  const accept = (next: LibraryCollection, nextOrigin: 'public' | 'account') => {
    origin.current = nextOrigin;
    setCollection(next);
    setSelected(new Set());
    setQuery('');
    onSourceChange();
  };
  const importSource = async () => {
    if (busy || pending.current || !source.trim()) return false;
    const token = ++request.current;
    pending.current = true;
    pendingOrigin.current = 'public';
    setLoading(true);
    onError('');
    try {
      const next = await importLibrary(source.trim());
      if (!mounted.current || token !== request.current) return false;
      accept(next, 'public');
      return true;
    } catch (error) {
      if (mounted.current && token === request.current && !isCancellationError(error))
        onError(getErrorMessage(error, 'Impossible de lire cette playlist ou cette chaîne.'));
      return false;
    } finally {
      if (mounted.current && token === request.current) {
        pending.current = false;
        pendingOrigin.current = null;
        setLoading(false);
      }
    }
  };
  const loadAccountVideos = async (playlistId: string, title: string, more = false) => {
    if (busy || pending.current) return false;
    const token = ++request.current;
    pending.current = true;
    pendingOrigin.current = 'account';
    setLoading(true);
    onError('');
    try {
      const page = await getAccountVideos(
        playlistId,
        more ? collection?.nextPageToken || undefined : undefined
      );
      if (!mounted.current || token !== request.current) return false;
      const unique = new Map<string, LibraryVideo>();
      if (more) for (const video of collection?.items || []) unique.set(video.id, video);
      for (const video of page.items) {
        unique.set(
          video.id,
          video.privacyStatus === 'private'
            ? {
                ...video,
                available: false,
                reason:
                  'Vidéo privée : accès au téléchargement non disponible avec cette connexion.'
              }
            : video
        );
      }
      const next: LibraryCollection = {
        id: playlistId,
        title,
        sourceUrl: `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`,
        kind: 'playlist',
        items: [...unique.values()],
        total: unique.size,
        truncated: false,
        nextPageToken: page.nextPageToken
      };
      if (more) setCollection(next);
      else accept(next, 'account');
      return true;
    } catch (error) {
      if (mounted.current && token === request.current && !isCancellationError(error))
        onError(getErrorMessage(error, 'Impossible de récupérer ces vidéos.'));
      return false;
    } finally {
      if (mounted.current && token === request.current) {
        pending.current = false;
        pendingOrigin.current = null;
        setLoading(false);
      }
    }
  };
  const clearAccountCollection = useCallback(() => {
    const shouldClear = origin.current === 'account' || pendingOrigin.current === 'account';
    if (shouldClear) reset();
    return shouldClear;
  }, [reset]);
  const visible = (collection?.items || []).filter((video) =>
    video.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );
  const selectable = visible.filter((video) => video.available);
  const selectedItems = (collection?.items || []).filter(
    (video) => video.available && selected.has(video.id)
  );
  const toggle = (id: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        if (next.size < maxBatchItems) next.add(id);
      } else next.delete(id);
      return next;
    });
  };
  const toggleVisible = (checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const video of selectable) {
        if (checked) {
          if (next.size < maxBatchItems) next.add(video.id);
        } else next.delete(video.id);
      }
      return next;
    });
  };
  return {
    source,
    setSource,
    collection,
    loading,
    cancel,
    query,
    setQuery,
    selected,
    setSelected,
    targetHeight,
    setTargetHeight,
    visible,
    selectable,
    selectedItems,
    toggle,
    toggleVisible,
    importSource,
    loadAccountVideos,
    clearAccountCollection
  };
}
