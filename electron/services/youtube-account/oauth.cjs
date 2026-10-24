const http = require('node:http');
const nodeCrypto = require('node:crypto');
const { createAbortError } = require('../process-runner.cjs');

const READONLY_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';

function accountError(message, code) {
  const error = new Error(message);
  error.name = 'YouTubeAccountError';
  if (code) error.code = code;
  return error;
}

function sameState(actual, expected) {
  if (typeof actual !== 'string') return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && nodeCrypto.timingSafeEqual(left, right);
}

function authorizeDesktop({ config, openExternal, signal, timeoutMs = 120000 }) {
  if (signal?.aborted) return Promise.reject(createAbortError());
  const state = nodeCrypto.randomBytes(32).toString('base64url');
  const verifier = nodeCrypto.randomBytes(48).toString('base64url');
  const challenge = nodeCrypto.createHash('sha256').update(verifier).digest('base64url');
  return new Promise((resolve, reject) => {
    let settled = false;
    let redirectUri;
    const finish = (error, code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      server.close();
      // Flush the tiny browser response, then close any idle local connection.
      const cleanup = setTimeout(() => server.closeAllConnections(), 100);
      cleanup.unref();
      if (error) reject(error);
      else resolve({ code, verifier, redirectUri });
    };
    const abort = () => finish(createAbortError());
    const respond = (response, status, text) => {
      response.writeHead(status, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'",
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff'
      });
      response.end(text);
    };
    const server = http.createServer((request, response) => {
      const address = server.address();
      const expectedHost = address && `127.0.0.1:${address.port}`;
      let url;
      try {
        url = new URL(request.url, 'http://127.0.0.1');
      } catch {
        respond(response, 400, 'Réponse invalide.');
        return;
      }
      if (
        request.method !== 'GET' ||
        request.headers.host !== expectedHost ||
        url.pathname !== '/oauth2callback'
      ) {
        respond(response, 404, 'Page introuvable.');
        return;
      }
      if (!sameState(url.searchParams.get('state'), state)) {
        respond(response, 400, 'Cette connexion ne correspond pas à la demande en cours.');
        finish(accountError('La réponse Google ne correspond pas à cette connexion. Réessayez.'));
        return;
      }
      if (url.searchParams.has('error')) {
        respond(response, 200, 'Connexion annulée. Vous pouvez revenir dans l’application.');
        finish(
          url.searchParams.get('error') === 'access_denied'
            ? createAbortError()
            : accountError(
                'Google n’a pas autorisé cette connexion. Vérifiez la configuration puis réessayez.'
              )
        );
        return;
      }
      const code = url.searchParams.get('code');
      if (!code || code.length > 8192 || /[\r\n\0]/.test(code)) {
        respond(response, 400, 'Le code de connexion est absent ou invalide.');
        finish(accountError('Google n’a pas renvoyé de code de connexion valide. Réessayez.'));
        return;
      }
      respond(
        response,
        200,
        'Connexion reçue. Vous pouvez fermer cet onglet et revenir dans l’application.'
      );
      finish(null, code);
    });
    server.requestTimeout = 10000;
    server.headersTimeout = 10000;
    const timer = setTimeout(
      () => finish(accountError('La connexion Google a expiré. Réessayez.')),
      timeoutMs
    );
    signal?.addEventListener('abort', abort, { once: true });
    server.once('error', () =>
      finish(accountError('Impossible de préparer la connexion Google sur cet ordinateur.'))
    );
    server.listen(0, '127.0.0.1', () => {
      if (settled || signal?.aborted) {
        abort();
        server.close();
        return;
      }
      const address = server.address();
      redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: READONLY_SCOPE,
        access_type: 'offline',
        prompt: 'consent select_account',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state
      }).toString();
      Promise.resolve()
        .then(() => openExternal(url.toString()))
        .catch(() => {
          finish(accountError('Impossible d’ouvrir le navigateur pour se connecter à Google.'));
        });
    });
  });
}

module.exports = { READONLY_SCOPE, accountError, authorizeDesktop };
