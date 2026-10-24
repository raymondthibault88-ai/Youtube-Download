const path = require('node:path');
const { createAbortError } = require('./process-runner.cjs');
const { accountError, authorizeDesktop } = require('./youtube-account/oauth.cjs');
const {
  atomicWrite,
  canEncrypt,
  deleteRefreshToken,
  loadRefreshToken,
  parseConfig,
  readConfigFile,
  saveRefreshToken
} = require('./youtube-account/storage.cjs');
const { getChannel, getPlaylists, getVideos } = require('./youtube-account/catalog.cjs');

const { GoogleYouTubeClient } = require('./youtube-account/http.cjs');
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API_BASE = 'https://www.googleapis.com/youtube/v3/';

function friendly(error) {
  return error?.name === 'YouTubeAccountError'
    ? error
    : accountError('Impossible de joindre Google. Vérifiez votre connexion puis réessayez.');
}

class YouTubeAccountService {
  constructor({
    app,
    safeStorage,
    openExternal,
    fetch: fetchImpl = globalThis.fetch,
    env = process.env,
    notify = () => {},
    timeoutMs = 120000,
    requestTimeoutMs = 20000,
    now = Date.now
  }) {
    this.directory = app.getPath('userData');
    this.configPath = path.join(this.directory, 'google-oauth.json');
    this.tokenPath = path.join(this.directory, 'youtube-account.enc');
    this.safeStorage = safeStorage;
    this.openExternal = openExternal;
    this.client = new GoogleYouTubeClient({
      fetch: fetchImpl,
      requestTimeoutMs,
      now,
      getConfig: () => this.config
    });
    this.env = env;
    this.notify = notify;
    this.timeoutMs = timeoutMs;

    this.now = now;
    this.config = null;
    this.credentials = null;
    this.channel = null;
    this.connecting = false;
    this.error = null;
    this.generation = 0;
    this.disposed = false;
    this.initialization = null;
    this.operation = null;
    this.disconnecting = null;
    this.refreshOperation = null;
    this.connectionController = null;
    this.sessionController = new AbortController();
    this.storageWork = Promise.resolve();
  }

  snapshot() {
    return {
      configured: Boolean(this.config),
      connected: Boolean(this.credentials && this.channel),
      connecting: this.connecting,
      channel: this.channel ? { ...this.channel } : null,
      error: this.error
    };
  }

  emit() {
    this.notify(this.snapshot());
  }

  checkActive(generation, signal) {
    if (this.disposed || signal?.aborted || generation !== this.generation)
      throw createAbortError();
  }

  store(operation) {
    const work = this.storageWork.then(operation);
    this.storageWork = work.catch(() => {});
    return work;
  }

  init() {
    if (this.initialization) return this.initialization;
    this.initialization = (async () => {
      try {
        try {
          this.config = await readConfigFile(this.configPath);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          if (this.env.YOUTUBE_GOOGLE_CLIENT_ID)
            this.config = parseConfig({
              installed: {
                client_id: this.env.YOUTUBE_GOOGLE_CLIENT_ID,
                client_secret: this.env.YOUTUBE_GOOGLE_CLIENT_SECRET
              }
            });
        }
        if (!this.config) return this.snapshot();
        const generation = this.generation;
        const refreshToken = await loadRefreshToken(this.tokenPath, this.config, this.safeStorage);
        this.checkActive(generation);
        if (refreshToken) {
          this.credentials = { refreshToken, accessToken: null, expiresAt: 0 };
          this.channel = await getChannel((resource, parameters) => this.api(resource, parameters));
          this.checkActive(generation);
        }
      } catch (error) {
        if (error.name !== 'AbortError') this.error = friendly(error).message;
      }
      this.emit();
      return this.snapshot();
    })();
    return this.initialization;
  }

  async configureFromFile(filename) {
    await this.init();
    if (!path.isAbsolute(filename))
      throw accountError('Choisissez un fichier de configuration Google valide.');
    const config = await readConfigFile(filename).catch((error) => {
      throw error.name === 'YouTubeAccountError'
        ? error
        : accountError('Le fichier de configuration Google choisi ne peut pas être lu.');
    });
    await this.disconnect();
    await this.store(() =>
      atomicWrite(
        this.configPath,
        JSON.stringify({
          installed: {
            client_id: config.clientId,
            ...(config.clientSecret ? { client_secret: config.clientSecret } : {})
          }
        })
      )
    );
    this.config = config;
    this.error = null;
    this.emit();
    return this.snapshot();
  }

  async accessToken(signal) {
    const generation = this.generation;
    this.checkActive(generation, signal);
    if (!this.credentials)
      throw accountError('Connectez votre compte YouTube pour ouvrir cette bibliothèque.');
    if (this.credentials.accessToken && this.credentials.expiresAt > this.now() + 60000)
      return this.credentials.accessToken;
    if (this.refreshOperation) return this.refreshOperation;
    const refresh = (async () => {
      try {
        const current = this.credentials;
        const data = await this.client.tokenRequest(
          { grant_type: 'refresh_token', refresh_token: current.refreshToken },
          this.sessionController.signal
        );
        this.checkActive(generation, signal);
        this.credentials = { ...data, refreshToken: data.refreshToken || current.refreshToken };
        if (data.refreshToken && data.refreshToken !== current.refreshToken)
          await this.store(() => {
            this.checkActive(generation);
            return saveRefreshToken(
              this.tokenPath,
              this.credentials,
              this.config,
              this.safeStorage
            );
          });
        return this.credentials.accessToken;
      } catch (error) {
        if (error.code === 'invalid_grant' && generation === this.generation) {
          this.credentials = null;
          this.channel = null;
          await this.store(() => deleteRefreshToken(this.tokenPath));
          this.error = error.message;
          this.emit();
        }
        throw error;
      }
    })();
    this.refreshOperation = refresh;
    try {
      return await refresh;
    } finally {
      if (this.refreshOperation === refresh) this.refreshOperation = null;
    }
  }

  async api(resource, parameters, signal) {
    const generation = this.generation;
    const combined = signal
      ? AbortSignal.any([signal, this.sessionController.signal])
      : this.sessionController.signal;
    const url = new URL(resource, API_BASE);
    for (const [key, value] of Object.entries(parameters))
      if (value !== undefined) url.searchParams.set(key, String(value));
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.accessToken(combined);
      try {
        const data = await this.client.requestJson(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
          signal: combined
        });
        this.checkActive(generation, combined);
        return data;
      } catch (error) {
        if (error.code !== 'unauthorized' || attempt > 0) throw error;
        if (this.credentials) this.credentials.expiresAt = 0;
      }
    }
  }

  async connect(signal) {
    await this.init();
    if (this.disconnecting) await this.disconnecting;
    if (this.operation) return this.operation;
    if (this.snapshot().connected) return this.snapshot();
    if (!this.config)
      throw accountError(
        'La connexion Google n’est pas encore configurée dans cette version test.'
      );
    if (!canEncrypt(this.safeStorage))
      throw accountError('Le stockage sécurisé de cet ordinateur est indisponible.');
    const generation = this.generation;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    this.connectionController = controller;
    this.sessionController = new AbortController();
    this.connecting = true;
    this.error = null;
    this.emit();
    const operation = (async () => {
      try {
        const authorization = await authorizeDesktop({
          config: this.config,
          openExternal: this.openExternal,
          signal: controller.signal,
          timeoutMs: this.timeoutMs
        });
        const credentials = await this.client.tokenRequest(
          {
            grant_type: 'authorization_code',
            code: authorization.code,
            code_verifier: authorization.verifier,
            redirect_uri: authorization.redirectUri
          },
          controller.signal
        );
        this.checkActive(generation, controller.signal);
        if (!credentials.refreshToken)
          throw accountError(
            'Google n’a pas fourni de connexion persistante. Réessayez en autorisant l’accès YouTube.'
          );
        this.credentials = credentials;
        this.channel = await getChannel((resource, parameters) =>
          this.api(resource, parameters, controller.signal)
        );
        this.checkActive(generation, controller.signal);
        await this.store(() => {
          this.checkActive(generation, controller.signal);
          return saveRefreshToken(this.tokenPath, this.credentials, this.config, this.safeStorage);
        });
        this.checkActive(generation, controller.signal);
      } catch (error) {
        if (generation === this.generation) {
          this.credentials = null;
          this.channel = null;
          this.error = error.name === 'AbortError' ? null : friendly(error).message;
          await this.store(() => deleteRefreshToken(this.tokenPath)).catch(() => {
            this.error = 'Impossible de supprimer la connexion enregistrée. Réessayez.';
          });
        }
      } finally {
        signal?.removeEventListener('abort', abort);
        if (this.connectionController === controller) {
          this.connectionController = null;
          this.connecting = false;
        }
        this.emit();
      }
      return this.snapshot();
    })();
    this.operation = operation;
    try {
      return await operation;
    } finally {
      if (this.operation === operation) this.operation = null;
    }
  }

  cancelConnect() {
    this.connectionController?.abort();
    if (this.connectionController) {
      this.sessionController.abort();
      this.credentials = null;
      this.channel = null;
      this.connecting = false;
      this.emit();
    }
    return this.snapshot();
  }

  async disconnect() {
    await this.init();
    if (this.disconnecting) return this.disconnecting;
    const token = this.credentials?.refreshToken || this.credentials?.accessToken;
    this.generation++;
    this.connectionController?.abort();
    this.sessionController.abort();
    this.credentials = null;
    this.channel = null;
    this.connecting = false;
    this.error = null;
    this.emit();
    const operation = (async () => {
      await this.store(() => deleteRefreshToken(this.tokenPath));
      if (token) {
        try {
          await this.client.requestJson(REVOKE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token })
          });
        } catch {
          this.error =
            'La connexion locale a été supprimée. Google n’a pas pu confirmer la révocation ; vous pouvez retirer l’accès dans les autorisations de votre compte Google.';
        }
      }
      this.emit();
      return this.snapshot();
    })();
    this.disconnecting = operation;
    try {
      return await operation;
    } finally {
      if (this.disconnecting === operation) this.disconnecting = null;
    }
  }

  async listPlaylists(options = {}) {
    await this.init();
    return getPlaylists(
      (resource, parameters) => this.api(resource, parameters, options.signal),
      options
    );
  }

  async listVideos(options = {}) {
    await this.init();
    return getVideos(
      (resource, parameters) => this.api(resource, parameters, options.signal),
      options
    );
  }

  dispose() {
    this.disposed = true;
    this.generation++;
    this.connectionController?.abort();
    this.sessionController.abort();
    this.credentials = null;
    this.channel = null;
  }
}

module.exports = { YouTubeAccountService };
