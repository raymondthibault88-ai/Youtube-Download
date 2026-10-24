const { createAbortError } = require('../process-runner.cjs');
const { READONLY_SCOPE, accountError } = require('./oauth.cjs');
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

class GoogleYouTubeClient {
  constructor({ fetch, requestTimeoutMs, now, getConfig }) {
    this.fetch = fetch;
    this.requestTimeoutMs = requestTimeoutMs;
    this.now = now;
    this.getConfig = getConfig;
  }
  get config() {
    return this.getConfig();
  }
  async requestJson(url, options = {}) {
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(this.requestTimeoutMs)])
      : AbortSignal.timeout(this.requestTimeoutMs);
    let response;
    let data;
    try {
      response = await this.fetch(url, { ...options, signal, redirect: 'error' });
      const text = await response.text();
      if (text.length > 2 * 1024 * 1024) throw new Error();
      data = text ? JSON.parse(text) : {};
      if (!data || typeof data !== 'object') throw new Error();
    } catch {
      if (options.signal?.aborted) throw createAbortError();
      throw accountError('Impossible de joindre Google. Vérifiez votre connexion puis réessayez.');
    }
    if (response.ok) return data;
    const reason = typeof data.error === 'string' ? data.error : data.error?.errors?.[0]?.reason;
    if (reason === 'invalid_grant')
      throw accountError(
        'La connexion Google a expiré ou a été retirée. Reconnectez votre compte.',
        'invalid_grant'
      );
    if (response.status === 401)
      throw accountError('La connexion Google a expiré. Reconnectez votre compte.', 'unauthorized');
    if (['quotaExceeded', 'dailyLimitExceeded'].includes(reason))
      throw accountError('La limite de consultation YouTube a été atteinte. Réessayez plus tard.');
    if (['accessNotConfigured', 'serviceDisabled'].includes(reason))
      throw accountError(
        'L’API YouTube doit être activée dans le projet Google de cette connexion.'
      );
    if (response.status === 403 || response.status === 404)
      throw accountError('Cette vidéo ou playlist n’est pas accessible avec ce compte.');
    throw accountError('Google n’a pas pu terminer cette demande. Réessayez.');
  }

  async tokenRequest(parameters, signal) {
    const body = new URLSearchParams({ client_id: this.config.clientId, ...parameters });
    if (this.config.clientSecret) body.set('client_secret', this.config.clientSecret);
    const data = await this.requestJson(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal
    });
    if (
      typeof data.access_token !== 'string' ||
      !data.access_token ||
      data.access_token.length > 16384 ||
      /[\r\n\0]/.test(data.access_token)
    )
      throw accountError('Google n’a pas fourni d’autorisation valide. Réessayez.');
    if (data.scope && !String(data.scope).split(' ').includes(READONLY_SCOPE))
      throw accountError('L’autorisation de lecture YouTube n’a pas été accordée.');
    const expiresIn = Number(data.expires_in);
    return {
      accessToken: data.access_token,
      refreshToken:
        typeof data.refresh_token === 'string' && data.refresh_token.length <= 16384
          ? data.refresh_token
          : null,
      expiresAt:
        this.now() +
        (Number.isFinite(expiresIn) && expiresIn > 0 && expiresIn <= 604800 ? expiresIn : 3600) *
          1000
    };
  }
}
module.exports = { GoogleYouTubeClient };
