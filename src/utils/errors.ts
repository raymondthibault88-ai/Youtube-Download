export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (typeof error === 'string') {
    return error || fallback;
  }

  return fallback;
}

export function isCancellationError(error: unknown) {
  return (
    (error instanceof Error && error.name === 'AbortError') ||
    /opération annulée|operation.*aborted|téléchargement annulé/i.test(getErrorMessage(error, ''))
  );
}

export function describeError(raw: string) {
  const message = raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '');
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|network|timed out|HTTP Error 5/i.test(message))
    return {
      message: 'La connexion n’a pas abouti. Vérifiez votre accès à Internet, puis réessayez.',
      details: raw
    };
  if (/private video|not available|unavailable|sign in|age.restrict|confirm.*bot/i.test(message))
    return {
      message: 'Cette vidéo n’est pas accessible. Essayez un autre lien public.',
      details: raw
    };
  if (/ENOSPC/i.test(message))
    return {
      message:
        'L’espace disponible est insuffisant. Choisissez un autre dossier ou libérez de l’espace.',
      details: raw
    };
  if (/EACCES|EPERM|permission denied/i.test(message))
    return {
      message: 'Ce dossier n’est pas accessible en écriture. Choisissez un autre emplacement.',
      details: raw
    };
  if (
    message.length > 220 ||
    /\[.*(?:error|ffmpeg)|Traceback|Émetteur IPC|bridge Electron/i.test(message)
  )
    return {
      message: 'Le traitement n’a pas pu aboutir. Réessayez ou consultez les détails.',
      details: raw
    };
  return { message, details: '' };
}
