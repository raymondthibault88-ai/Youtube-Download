const fs = require('node:fs');
const { dialog } = require('electron');
const ipc = require('../../shared/ipc.json');
const conversionConfig = require('../../shared/conversion-config.json');
const { maxBatchItems } = require('../../shared/library-config.json');
const { YouTubeLibraryService } = require('../services/youtube-library.cjs');
const { runDownloadBatch, normalizeBatchItems } = require('../services/download-batch.cjs');
const { createAbortError } = require('../services/process-runner.cjs');
const {
  requireAbsolutePath,
  validateFormatId,
  validateYouTubeUrl
} = require('../services/validation.cjs');

function validateBatchPayload(payload) {
  if (
    !Array.isArray(payload?.items) ||
    payload.items.length < 1 ||
    payload.items.length > maxBatchItems
  ) {
    throw new Error(`Sélectionnez entre 1 et ${maxBatchItems} vidéos.`);
  }
  const items = payload.items.map((item) => ({
    ...(typeof item?.id === 'string' && /^[\w-]{11}$/.test(item.id) ? { id: item.id } : {}),
    url: validateYouTubeUrl(item?.url),
    title: typeof item?.title === 'string' ? item.title.slice(0, 500) : '',
    ...(item?.formatId != null ? { formatId: validateFormatId(item.formatId) } : {})
  }));
  const targetHeight = payload.targetHeight == null ? null : Number(payload.targetHeight);
  if (targetHeight !== null && !conversionConfig.resolutions.includes(targetHeight)) {
    throw new Error('Qualité du lot invalide.');
  }
  return {
    items: normalizeBatchItems(items),
    targetHeight,
    outputDir: requireAbsolutePath(payload.outputDir, 'Dossier de sortie')
  };
}

function registerLibraryHandlers({
  app,
  handle,
  jobs,
  getYoutube,
  dependencyService,
  updateService,
  revealablePaths,
  accountService,
  accountReady
}) {
  const imports = new Map();
  const getAccount = async () => {
    await accountReady;
    return accountService;
  };
  const withAccountSender = async (event, operation, content = false) => {
    const controller = new AbortController();
    const id = event.sender.id;
    if (content) {
      imports.get(id)?.abort();
      imports.set(id, controller);
    }
    const destroyed = () => controller.abort();
    event.sender.once('destroyed', destroyed);
    if (event.sender.isDestroyed()) destroyed();
    try {
      const account = await getAccount();
      if (controller.signal.aborted) throw createAbortError();
      return await operation(account, controller.signal);
    } finally {
      event.sender.removeListener('destroyed', destroyed);
      if (content && imports.get(id) === controller) imports.delete(id);
    }
  };
  const noJob = () => {
    if (['running', 'cancelling'].includes(jobs.snapshot()?.state))
      throw new Error('Attendez la fin du traitement avant de charger une autre liste.');
  };
  handle(ipc.invoke.libraryImport, async (event, source) => {
    noJob();
    const id = event.sender.id;
    imports.get(id)?.abort();
    const controller = new AbortController();
    imports.set(id, controller);
    try {
      const { ytDlpPath } = await dependencyService.getYtDlpInfo();
      return await new YouTubeLibraryService({ ytDlpPath }).import(source, controller.signal);
    } finally {
      if (imports.get(id) === controller) imports.delete(id);
    }
  });
  handle(ipc.invoke.libraryCancel, async (event) => {
    imports.get(event.sender.id)?.abort();
    return { ok: true };
  });
  handle(ipc.invoke.accountCurrent, async () => (await getAccount()).snapshot());
  handle(ipc.invoke.accountConfigure, async () => {
    noJob();
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Configurer la connexion Google',
      properties: ['openFile'],
      filters: [{ name: 'Configuration OAuth Google', extensions: ['json'] }]
    });
    if (canceled || !filePaths[0]) return null;
    return (await getAccount()).configureFromFile(filePaths[0]);
  });
  handle(ipc.invoke.accountConnect, async (event) => {
    noJob();
    return withAccountSender(event, (account, signal) => account.connect(signal));
  });
  handle(ipc.invoke.accountCancel, async () => {
    (await getAccount()).cancelConnect();
    return { ok: true };
  });
  handle(ipc.invoke.accountDisconnect, async () => (await getAccount()).disconnect());
  handle(ipc.invoke.accountPlaylists, async (event, pageToken) =>
    withAccountSender(event, (account, signal) => account.listPlaylists({ pageToken, signal }))
  );
  handle(ipc.invoke.accountVideos, async (event, playlistId, pageToken) =>
    withAccountSender(
      event,
      (account, signal) => account.listVideos({ playlistId, pageToken, signal }),
      true
    )
  );
  handle(ipc.invoke.downloadBatch, async (event, payload) => {
    updateService.assertCanStartJob();
    const clean = validateBatchPayload(payload);
    await fs.promises.mkdir(clean.outputDir, { recursive: true });
    const youtube = await getYoutube();
    updateService.assertCanStartJob();
    return jobs.start('batch', event.sender, ({ signal, update }) =>
      runDownloadBatch({
        ...clean,
        youtube,
        signal,
        onProgress: update,
        onItem: (item) => {
          if (item.state === 'completed' && item.outputPath) revealablePaths.add(item.outputPath);
          update({ batchItem: item });
        }
      })
    );
  });
  app.on('web-contents-created', (_, contents) => {
    const id = contents.id;
    contents.once('destroyed', () => imports.get(id)?.abort());
  });
  app.on('before-quit', () => {
    for (const controller of imports.values()) controller.abort();
  });
}

module.exports = { registerLibraryHandlers, validateBatchPayload };
