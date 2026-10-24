const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const nodeCrypto = require('node:crypto');
const { setImmediate: tick } = require('node:timers/promises');
const { YouTubeAccountService } = require('../electron/services/youtube-account.cjs');
const { READONLY_SCOPE } = require('../electron/services/youtube-account/oauth.cjs');

const CLIENT = '123-test.apps.googleusercontent.com';
const REFRESH = 'refresh-token-test-value';
const ACCESS = 'access-token-test-value';
const CHANNEL = {
  id: 'UCtestchannel',
  snippet: {
    title: 'Ma chaîne',
    thumbnails: { default: { url: 'https://yt3.ggpht.com/test.png' } }
  },
  contentDetails: { relatedPlaylists: { uploads: 'UUtestchannel' } }
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function encryption() {
  const key = nodeCrypto.randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'test-vault',
    encryptString: (value) => {
      const iv = nodeCrypto.randomBytes(12);
      const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    },
    decryptString: (value) => {
      const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
      decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString(
        'utf8'
      );
    }
  };
}

function setup(t, options = {}) {
  const directory = options.directory || fs.mkdtempSync(path.join(os.tmpdir(), 'youtube-account-'));
  if (!options.directory) t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const calls = { opened: [], requests: [], states: [] };
  const safeStorage = options.safeStorage || encryption();
  const app = { getPath: () => directory };
  const fetchImpl = async (url, request = {}) => {
    const parsed = new URL(url);
    assert.ok(['oauth2.googleapis.com', 'www.googleapis.com'].includes(parsed.hostname));
    calls.requests.push({ url: parsed, request });
    const custom = await options.respond?.(parsed, request);
    if (custom) return custom;
    if (parsed.pathname === '/token')
      return json({
        access_token: ACCESS,
        refresh_token: REFRESH,
        expires_in: 3600,
        scope: READONLY_SCOPE
      });
    if (parsed.pathname === '/revoke') return new Response('', { status: 200 });
    if (parsed.pathname.endsWith('/channels')) return json({ items: [CHANNEL] });
    if (parsed.pathname.endsWith('/playlists')) return json({ items: [] });
    if (parsed.pathname.endsWith('/playlistItems')) return json({ items: [] });
    throw new Error('Unexpected fake request');
  };
  const service = new YouTubeAccountService({
    app,
    safeStorage,
    env: options.env || {
      YOUTUBE_GOOGLE_CLIENT_ID: CLIENT,
      YOUTUBE_GOOGLE_CLIENT_SECRET: 'desktop-public-secret'
    },
    fetch: fetchImpl,
    notify: (state) => calls.states.push(state),
    timeoutMs: options.timeoutMs || 1000,
    now: options.now,
    openExternal: async (value) => {
      const url = new URL(value);
      calls.opened.push(url);
      if (options.browser) return options.browser(url);
      const callback = new URL(url.searchParams.get('redirect_uri'));
      callback.searchParams.set('state', url.searchParams.get('state'));
      callback.searchParams.set('code', 'one-time-authorization-code');
      const response = await fetch(callback);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /revenir dans l’application/);
    }
  });
  t.after(() => service.dispose());
  return { service, calls, directory, safeStorage };
}

test('desktop connection uses loopback, state and PKCE, keeps refresh tokens encrypted and never exposes tokens', async (t) => {
  const { service, calls, directory } = setup(t);
  assert.equal((await service.init()).configured, true);
  const result = await service.connect();
  assert.equal(result.connected, true);
  assert.equal(result.connecting, false);
  assert.equal(result.channel.uploadsPlaylistId, 'UUtestchannel');
  const authorization = calls.opened[0];
  assert.equal(authorization.origin, 'https://accounts.google.com');
  assert.equal(authorization.searchParams.get('scope'), READONLY_SCOPE);
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(new URL(authorization.searchParams.get('redirect_uri')).hostname, '127.0.0.1');
  const token = calls.requests.find(({ url }) => url.pathname === '/token');
  assert.equal(token.request.body.get('client_id'), CLIENT);
  assert.equal(token.request.body.get('code'), 'one-time-authorization-code');
  assert.equal(
    nodeCrypto
      .createHash('sha256')
      .update(token.request.body.get('code_verifier'))
      .digest('base64url'),
    authorization.searchParams.get('code_challenge')
  );
  assert.equal(token.url.search, '');
  const stored = fs.readFileSync(path.join(directory, 'youtube-account.enc'));
  assert.equal(stored.includes(Buffer.from(REFRESH)), false);
  assert.equal(stored.includes(Buffer.from(ACCESS)), false);
  for (const state of [result, ...calls.states]) {
    assert.equal(JSON.stringify(state).includes(REFRESH), false);
    assert.equal(JSON.stringify(state).includes(ACCESS), false);
  }
});

test('a mismatching OAuth state is rejected before exchanging any authorization code', async (t) => {
  const { service, calls } = setup(t, {
    browser: async (url) => {
      const callback = new URL(url.searchParams.get('redirect_uri'));
      callback.searchParams.set('state', 'not-the-request-state');
      callback.searchParams.set('code', 'do-not-exchange');
      const response = await fetch(callback);
      assert.equal(response.status, 400);
    }
  });
  const result = await service.connect();
  assert.equal(result.connected, false);
  assert.match(result.error, /ne correspond pas/);
  assert.equal(calls.requests.length, 0);
});

test('only one browser authorization is active and cancelling closes it without an error or saved tokens', async (t) => {
  let opened;
  const browserOpened = new Promise((resolve) => {
    opened = resolve;
  });
  const { service, calls, directory } = setup(t, { browser: () => opened() });
  const first = service.connect();
  const second = service.connect();
  await browserOpened;
  assert.equal(service.snapshot().connecting, true);
  assert.equal(service.cancelConnect().connecting, false);
  const results = await Promise.all([first, second]);
  assert.equal(calls.opened.length, 1);
  assert.equal(results[0].connected, false);
  assert.equal(results[0].error, null);
  assert.equal(fs.existsSync(path.join(directory, 'youtube-account.enc')), false);
});

test('browser rejection and authorization timeout leave the account disconnected with a safe message', async (t) => {
  const denied = setup(t, {
    browser: () => {
      throw new Error(`Secret ${REFRESH}`);
    }
  });
  const failed = await denied.service.connect();
  assert.match(failed.error, /navigateur/);
  assert.equal(failed.error.includes(REFRESH), false);
  const expired = setup(t, { timeoutMs: 20, browser: () => {} });
  const result = await expired.service.connect();
  assert.match(result.error, /expiré/);
  assert.equal(result.connected, false);
});

test('Google consent refusal is neutral while an invalid OAuth configuration reports a safe error', async (t) => {
  for (const code of ['access_denied', 'invalid_scope']) {
    const { service } = setup(t, {
      browser: async (url) => {
        const callback = new URL(url.searchParams.get('redirect_uri'));
        callback.searchParams.set('state', url.searchParams.get('state'));
        callback.searchParams.set('error', code);
        callback.searchParams.set('error_description', REFRESH);
        await fetch(callback);
      }
    });
    const result = await service.connect();
    assert.equal(result.connected, false);
    if (code === 'access_denied') assert.equal(result.error, null);
    else assert.match(result.error, /configuration/);
    assert.equal(JSON.stringify(result).includes(REFRESH), false);
  }
});

test('expired access tokens refresh once for concurrent requests and reload securely after restart', async (t) => {
  let clock = 0;
  let refreshes = 0;
  const respond = async (url, request) => {
    if (url.pathname === '/token' && request.body.get('grant_type') === 'refresh_token') {
      refreshes++;
      await tick();
      return json({
        access_token: `renewed-${refreshes}`,
        expires_in: 3600,
        scope: READONLY_SCOPE
      });
    }
  };
  const first = setup(t, { now: () => clock, respond });
  await first.service.connect();
  clock = 3600001;
  await Promise.all([first.service.listPlaylists(), first.service.listPlaylists()]);
  assert.equal(refreshes, 1);
  const headers = first.calls.requests
    .filter(({ url }) => url.pathname.endsWith('/playlists'))
    .map(({ request }) => request.headers.Authorization);
  assert.deepEqual(headers, ['Bearer renewed-1', 'Bearer renewed-1']);
  first.service.dispose();
  const restarted = setup(t, {
    directory: first.directory,
    safeStorage: first.safeStorage,
    now: () => clock,
    respond
  });
  assert.equal((await restarted.service.init()).connected, true);
  assert.equal(restarted.calls.opened.length, 0);
  assert.equal(refreshes, 2);
});

test('a revoked refresh token clears local authorization without exposing the provider error', async (t) => {
  let clock = 0;
  const { service, directory } = setup(t, {
    now: () => clock,
    respond: (url, request) => {
      if (url.pathname === '/token' && request.body.get('grant_type') === 'refresh_token')
        return json({ error: 'invalid_grant', error_description: `Do not expose ${REFRESH}` }, 400);
    }
  });
  await service.connect();
  clock = 3600001;
  await assert.rejects(
    service.listPlaylists(),
    (error) => /Reconnectez/.test(error.message) && !error.message.includes(REFRESH)
  );
  assert.equal(service.snapshot().connected, false);
  assert.equal(fs.existsSync(path.join(directory, 'youtube-account.enc')), false);
});

test('owned playlists and videos paginate, build canonical links and distinguish inaccessible items from private metadata', async (t) => {
  const firstId = 'abcDEF123_-';
  const missingId = 'missing0001';
  const { service, calls } = setup(t, {
    respond: (url) => {
      if (url.pathname.endsWith('/playlists'))
        return json({
          nextPageToken: 'next-list',
          items: [
            { id: 'PLtest', snippet: { title: 'Mes matchs' }, contentDetails: { itemCount: 123 } }
          ]
        });
      if (url.pathname.endsWith('/playlistItems'))
        return json({
          nextPageToken: 'next-videos',
          items: [
            { contentDetails: { videoId: firstId }, snippet: { title: 'Ancien titre' } },
            { snippet: { resourceId: { videoId: missingId }, title: 'Vidéo retirée' } },
            { contentDetails: { videoId: 'https://not-a-video.example' } }
          ]
        });
      if (url.pathname.endsWith('/videos'))
        return json({
          items: [
            {
              id: firstId,
              snippet: {
                title: 'Match privé',
                thumbnails: { medium: { url: 'https://i.ytimg.com/test.jpg' } }
              },
              status: { privacyStatus: 'private' },
              contentDetails: { duration: 'PT1H2M3S' }
            }
          ]
        });
    }
  });
  await service.connect();
  const lists = await service.listPlaylists({ pageToken: 'page-1' });
  assert.equal(lists.items[0].videoCount, 123);
  assert.equal(lists.nextPageToken, 'next-list');
  const result = await service.listVideos({ playlistId: 'PLtest', pageToken: 'page-2' });
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items[0], {
    id: firstId,
    title: 'Match privé',
    url: `https://www.youtube.com/watch?v=${firstId}`,
    thumbnail: 'https://i.ytimg.com/test.jpg',
    duration: 3723,
    available: true,
    privacyStatus: 'private'
  });
  assert.equal(result.items[1].available, false);
  assert.match(result.items[1].reason, /inaccessible/);
  assert.equal(result.nextPageToken, 'next-videos');
  const page = calls.requests.find(({ url }) => url.pathname.endsWith('/playlistItems'));
  assert.equal(page.url.searchParams.get('pageToken'), 'page-2');
  assert.equal(page.url.searchParams.get('maxResults'), '50');
  await assert.rejects(service.listVideos({ playlistId: '../../other-api' }), /invalide/);
});

test('disconnect revokes through a POST body and removes tokens and channel data, even when revocation is offline', async (t) => {
  const normal = setup(t);
  await normal.service.connect();
  const result = await normal.service.disconnect();
  assert.equal(result.connected, false);
  assert.equal(result.channel, null);
  assert.equal(result.error, null);
  assert.equal(fs.existsSync(path.join(normal.directory, 'youtube-account.enc')), false);
  const revoke = normal.calls.requests.find(({ url }) => url.pathname === '/revoke');
  assert.equal(revoke.url.search, '');
  assert.equal(revoke.request.method, 'POST');
  assert.equal(revoke.request.body.get('token'), REFRESH);
  const offline = setup(t, {
    respond: (url) => {
      if (url.pathname === '/revoke') throw new Error('offline');
    }
  });
  await offline.service.connect();
  const failed = await offline.service.disconnect();
  assert.equal(failed.connected, false);
  assert.match(failed.error, /connexion locale a été supprimée/);
  assert.equal(fs.existsSync(path.join(offline.directory, 'youtube-account.enc')), false);
});

test('a token exchange completing after disconnect cannot restore the account or save a refresh token', async (t) => {
  let entered;
  let release;
  const tokenEntered = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const { service, directory } = setup(t, {
    respond: async (url) => {
      if (url.pathname === '/token') {
        entered();
        await gate;
        return json({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600 });
      }
    }
  });
  const connection = service.connect();
  await tokenEntered;
  await service.disconnect();
  release();
  await connection;
  assert.equal(service.snapshot().connected, false);
  assert.equal(service.snapshot().channel, null);
  assert.equal(fs.existsSync(path.join(directory, 'youtube-account.enc')), false);
});

test('desktop JSON configuration is explicit and cannot redirect token requests to another host', async (t) => {
  const { service, directory, calls } = setup(t, { env: {} });
  assert.equal((await service.init()).configured, false);
  const chosen = path.join(directory, 'chosen-oauth.json');
  fs.writeFileSync(
    chosen,
    JSON.stringify({
      installed: {
        client_id: CLIENT,
        client_secret: 'desktop-public-secret',
        auth_uri: 'https://attacker.invalid',
        token_uri: 'https://attacker.invalid/token'
      }
    })
  );
  assert.equal((await service.configureFromFile(chosen)).configured, true);
  assert.equal((await service.connect()).connected, true);
  assert.equal(calls.opened[0].hostname, 'accounts.google.com');
  const invalid = path.join(directory, 'web-oauth.json');
  fs.writeFileSync(invalid, JSON.stringify({ web: { client_id: CLIENT } }));
  await assert.rejects(service.configureFromFile(invalid), /application de bureau/);
  assert.equal(service.snapshot().connected, true);
});

test('an insecure encryption backend prevents authorization before opening Google', async (t) => {
  const { service, calls } = setup(t, {
    safeStorage: {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'basic_text'
    }
  });
  await assert.rejects(service.connect(), /stockage sécurisé/);
  assert.equal(calls.opened.length, 0);
});
