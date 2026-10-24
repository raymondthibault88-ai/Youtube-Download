import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelYouTubeAccount,
  configureYouTubeAccount,
  connectYouTubeAccount,
  disconnectYouTubeAccount,
  getAccountPlaylists,
  getYouTubeAccount,
  onYouTubeAccount
} from '../services/desktopApi';
import type { AccountPlaylist, YouTubeAccountSnapshot } from '../types/library';
import { getErrorMessage, isCancellationError } from '../utils/errors';

export default function useLibraryAccount(
  onError: (message: string) => void,
  onSessionLost: () => void
) {
  const [account, setAccount] = useState<YouTubeAccountSnapshot | null>(null);
  const [playlists, setPlaylists] = useState<AccountPlaylist[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [working, setWorking] = useState(false);
  const [operationKind, setOperationKind] = useState<'connect' | 'configure' | 'disconnect' | null>(
    null
  );
  const mounted = useRef(true);
  const sequence = useRef(0);
  const operation = useRef(false);
  const channelId = useRef<string | null>(null);
  const refreshPlaylists = useCallback(
    async (pageToken?: string) => {
      const token = ++sequence.current;
      setLoadingPlaylists(true);
      try {
        const page = await getAccountPlaylists(pageToken);
        if (!mounted.current || sequence.current !== token) return;
        setPlaylists((current) => [
          ...new Map(
            [...(pageToken ? current : []), ...page.items].map((entry) => [entry.id, entry])
          ).values()
        ]);
        setNextPageToken(page.nextPageToken);
      } catch (error) {
        if (mounted.current && sequence.current === token)
          onError(getErrorMessage(error, 'Impossible de récupérer vos playlists.'));
      } finally {
        if (mounted.current && sequence.current === token) setLoadingPlaylists(false);
      }
    },
    [onError]
  );
  const accept = useCallback(
    (snapshot: YouTubeAccountSnapshot) => {
      if (!mounted.current) return;
      setAccount(snapshot);
      const nextChannel = snapshot.connected ? snapshot.channel?.id || 'connected' : null;
      if (nextChannel && channelId.current !== nextChannel) {
        if (channelId.current) onSessionLost();
        channelId.current = nextChannel;
        void refreshPlaylists();
      }
      if (!snapshot.connected) {
        channelId.current = null;
        sequence.current += 1;
        setPlaylists([]);
        setNextPageToken(null);
        setLoadingPlaylists(false);
        onSessionLost();
      }
    },
    [onSessionLost, refreshPlaylists]
  );
  useEffect(() => {
    mounted.current = true;
    let received = false;
    const unsubscribe = onYouTubeAccount((snapshot) => {
      received = true;
      accept(snapshot);
    });
    void getYouTubeAccount()
      .then((snapshot) => {
        if (!received) accept(snapshot);
      })
      .catch((error) => {
        if (mounted.current && !received)
          onError(getErrorMessage(error, 'Impossible de lire la connexion YouTube.'));
      });
    return () => {
      mounted.current = false;
      sequence.current += 1;
      unsubscribe();
    };
  }, [onError, accept]);
  const perform = async (
    action: () => Promise<YouTubeAccountSnapshot | null>,
    kind: 'connect' | 'configure' | 'disconnect'
  ) => {
    if (operation.current) return null;
    operation.current = true;
    setWorking(true);
    setOperationKind(kind);
    onError('');
    try {
      const snapshot = await action();
      if (mounted.current && snapshot) accept(snapshot);
      return snapshot;
    } catch (error) {
      if (mounted.current && !isCancellationError(error))
        onError(getErrorMessage(error, 'La connexion YouTube n’a pas abouti.'));
      return null;
    } finally {
      operation.current = false;
      if (mounted.current) {
        setWorking(false);
        setOperationKind(null);
      }
    }
  };
  const connect = () => perform(connectYouTubeAccount, 'connect');
  const configure = () => perform(configureYouTubeAccount, 'configure');
  const disconnect = async () => {
    await perform(disconnectYouTubeAccount, 'disconnect');
  };
  const cancel = async () => {
    try {
      await cancelYouTubeAccount();
    } catch (error) {
      if (mounted.current) onError(getErrorMessage(error, 'Impossible d’annuler la connexion.'));
    }
  };
  return {
    account,
    playlists,
    nextPageToken,
    loadingPlaylists,
    working,
    operationKind,
    connect,
    configure,
    disconnect,
    cancel,
    refreshPlaylists
  };
}
