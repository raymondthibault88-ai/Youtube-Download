import { useCallback, useEffect, useState } from 'react';
import { getUpdateState, onUpdateState } from '../services/desktopApi';
import type { UpdateSnapshot } from '../types/update';
import { getErrorMessage } from '../utils/errors';

export default function useAppUpdates() {
  const [update, setUpdate] = useState<UpdateSnapshot | null>(null);
  const [actionError, setActionError] = useState('');
  useEffect(() => {
    let active = true;
    let receivedUpdate = false;
    const unsubscribe = onUpdateState((snapshot) => {
      receivedUpdate = true;
      if (active) {
        setUpdate(snapshot);
        setActionError('');
      }
    });
    void getUpdateState()
      .then((snapshot) => {
        if (active && !receivedUpdate) setUpdate(snapshot);
      })
      .catch(() => {
        if (active && !receivedUpdate)
          setActionError('Impossible de vérifier les mises à jour pour le moment.');
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const request = useCallback(async (action: () => Promise<unknown>) => {
    setActionError('');
    try {
      await action();
    } catch (error) {
      setActionError(getErrorMessage(error, 'Impossible de mettre à jour l’application.'));
    }
  }, []);
  return { update, actionError, request };
}
