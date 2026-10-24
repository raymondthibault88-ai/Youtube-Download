const test = require('node:test');
const assert = require('node:assert/strict');
const {
  YouTubeLibraryService,
  normalizeLibrarySource
} = require('../electron/services/youtube-library.cjs');

const ids = ['abcdefghijk', 'lmnopqrstuv', 'wxyz1234567'];
const source = 'https://www.youtube.com/playlist?list=PL1234567890abcdefghijk';

test('playlist links are canonicalized without carrying video, tracking, time or fragment parameters', () => {
  const expected = { kind: 'playlist', url: source };
  for (const url of [
    source,
    source + '&index=7#fragment',
    'https://m.youtube.com/watch?v=abcdefghijk&list=PL1234567890abcdefghijk&t=90',
    'https://youtu.be/abcdefghijk?list=PL1234567890abcdefghijk'
  ]) {
    assert.deepEqual(normalizeLibrarySource(url), expected);
  }
});

test('channel handles, legacy channel links and explicit tabs retain their intended video listing', () => {
  for (const [input, expected] of [
    ['https://youtube.com/@CarnetsDeVoyage', 'https://www.youtube.com/@CarnetsDeVoyage/videos'],
    [
      'https://www.youtube.com/@CarnetsDeVoyage/shorts',
      'https://www.youtube.com/@CarnetsDeVoyage/shorts'
    ],
    [
      'https://youtube.com/channel/UCabcdefghijklmnopqrstuv',
      'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv/videos'
    ],
    [
      'https://youtube.com/user/GoogleDevelopers/videos?view=0',
      'https://www.youtube.com/user/GoogleDevelopers/videos'
    ],
    [
      'https://youtube.com/c/CarnetsDeVoyage/streams',
      'https://www.youtube.com/c/CarnetsDeVoyage/streams'
    ]
  ]) {
    assert.deepEqual(normalizeLibrarySource(input), { kind: 'channel', url: expected });
  }
});

test('foreign origins, credentials, alternative ports and unsupported YouTube pages never reach extraction', async () => {
  let calls = 0;
  const library = new YouTubeLibraryService({
    ytDlpPath: '/yt-dlp',
    processRunner: async () => {
      calls += 1;
    }
  });
  for (const url of [
    'http://youtube.com/@example',
    'https://youtube.com.attacker.example/@example',
    'https://user:pass@youtube.com/@example',
    'https://youtube.com:444/@example',
    'https://youtube.com/results?search_query=example',
    'https://youtube.com/watch?v=abcdefghijk',
    'https://youtube.com/playlist?list=--exec%20malicious',
    'https://youtube.com/@example/../../results'
  ]) {
    await assert.rejects(library.import(url));
  }
  assert.equal(calls, 0);
});

test('flat import uses the real runtime environment, a bounded extraction and the caller abort signal', async () => {
  const controller = new AbortController();
  const calls = [];
  const library = new YouTubeLibraryService({
    ytDlpPath: '/yt-dlp',
    runtimePath: '/electron',
    limit: 2,
    processRunner: async (...args) => {
      calls.push(args);
      return { stdout: JSON.stringify({ title: 'Voyages', entries: [] }) };
    }
  });
  await library.import(source, controller.signal);
  const [binary, args, options] = calls[0];
  assert.equal(binary, '/yt-dlp');
  for (const option of [
    '--ignore-config',
    '--flat-playlist',
    '--dump-single-json',
    '--skip-download',
    '--yes-playlist',
    '--ignore-errors'
  ])
    assert.ok(args.includes(option));
  assert.equal(args[args.indexOf('--playlist-end') + 1], '3');
  assert.equal(args[args.indexOf('--encoding') + 1], 'utf-8');
  assert.equal(args[args.indexOf('--js-runtimes') + 1], 'node:/electron');
  assert.equal(args.at(-1), source);
  assert.equal(options.env.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(options.signal, controller.signal);
  assert.equal(options.outputLimit, 16 * 1024 * 1024);
});

test('flat entries are deduplicated and expose canonical video links without transport or session data', async () => {
  const secretTransport = 'https://media.example.invalid/videoplayback?secret=do-not-expose';
  const entries = [
    {
      id: ids[0],
      title: 'Été à Dijon',
      duration: 61.2,
      url: secretTransport,
      manifest_url: secretTransport,
      http_headers: { Authorization: 'secret' }
    },
    { id: ids[0], title: 'Doublon' },
    {
      url: ids[1],
      title: 'Une autre vidéo',
      thumbnails: [{ url: 'https://i.ytimg.com/vi/lmnopqrstuv/hqdefault.jpg' }]
    },
    { id: 'bad-id', title: 'Pas une vidéo' },
    null
  ];
  const library = new YouTubeLibraryService({
    ytDlpPath: '/yt-dlp',
    processRunner: async () => ({
      stdout: JSON.stringify({ id: 'PL123', title: 'Ma playlist', entries })
    })
  });
  const result = await library.import(source);
  assert.deepEqual(
    result.items.map((item) => item.id),
    ids.slice(0, 2)
  );
  assert.equal(result.items[0].url, `https://www.youtube.com/watch?v=${ids[0]}`);
  assert.equal(result.items[0].duration, 61.2);
  assert.equal(result.items[0].title, 'Été à Dijon');
  assert.equal(result.items[0].available, true);
  assert.equal(result.kind, 'playlist');
  assert.equal(result.nextPageToken, null);
  assert.equal(result.truncated, false);
  assert.ok(!JSON.stringify(result).includes('secret'));
  assert.ok(!JSON.stringify(result).includes('manifest_url'));
});

test('private and deleted videos remain visible as disabled entries and unsafe thumbnails use a public canonical image', async () => {
  const entries = [
    {
      id: ids[0],
      title: 'Ma vidéo privée',
      availability: 'private',
      thumbnail: 'https://localhost/private-resource',
      thumbnails: {}
    },
    { id: ids[1], title: '[Deleted video]' },
    {
      id: ids[2],
      title: 'Vidéo disponible',
      thumbnail: 'http://i.ytimg.com/unsafe.jpg',
      duration: -20
    }
  ];
  const library = new YouTubeLibraryService({
    ytDlpPath: '/yt-dlp',
    processRunner: async () => ({ stdout: JSON.stringify({ entries }) })
  });
  const result = await library.import(source);
  assert.deepEqual(
    result.items.map((item) => item.available),
    [false, false, true]
  );
  assert.equal(result.items[0].reason, 'Vidéo privée');
  assert.match(result.items[1].reason, /indisponible/);
  for (const item of result.items) assert.match(item.thumbnail, /^https:\/\/i\.ytimg\.com\/vi\//);
  assert.equal(result.items[2].duration, null);
});

test('a bounded listing explicitly reports omitted entries and never returns more than the limit', async () => {
  const library = new YouTubeLibraryService({
    ytDlpPath: '/yt-dlp',
    limit: 2,
    processRunner: async () => ({
      stdout: JSON.stringify({ playlist_count: 843, entries: ids.map((id) => ({ id, title: id })) })
    })
  });
  const result = await library.import(source);
  assert.equal(result.items.length, 2);
  assert.equal(result.total, 843);
  assert.equal(result.truncated, true);
});

test('cancellation stops a waiting import and a late completed extraction cannot return stale data', async () => {
  let calls = 0;
  const cancelled = new AbortController();
  cancelled.abort();
  const first = new YouTubeLibraryService({
    ytDlpPath: '/yt-dlp',
    processRunner: async () => {
      calls += 1;
    }
  });
  await assert.rejects(first.import(source, cancelled.signal), { name: 'AbortError' });
  assert.equal(calls, 0);
  const controller = new AbortController();
  const second = new YouTubeLibraryService({
    ytDlpPath: '/yt-dlp',
    processRunner: async (_binary, _args, { signal }) => {
      assert.equal(signal, controller.signal);
      controller.abort();
      return { stdout: JSON.stringify({ entries: [{ id: ids[0] }] }) };
    }
  });
  await assert.rejects(second.import(source, controller.signal), { name: 'AbortError' });
});

test('private lists, failed extraction, malformed output and missing lists produce useful errors', async () => {
  for (const [response, expected] of [
    [
      () => {
        throw new Error('This channel does not have a videos tab');
      },
      /ne possède pas d’onglet Vidéos/
    ],
    [
      () => {
        throw new Error('Sign in to confirm access to private playlist');
      },
      /compte YouTube/
    ],
    [
      () => {
        throw new Error('HTTP Error 500: upstream failure');
      },
      /Vérifiez le lien/
    ],
    [() => ({ stdout: 'not JSON' }), /n’a pas pu être lue/],
    [() => ({ stdout: 'null' }), /n’est pas accessible/]
  ]) {
    const library = new YouTubeLibraryService({
      ytDlpPath: '/yt-dlp',
      processRunner: async () => response()
    });
    await assert.rejects(library.import(source), expected);
  }
});
