const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getAvailableOutputPath } = require('../electron/services/media.cjs');
const { YouTubeService } = require('../electron/services/youtube.cjs');

function createDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'video-v5-names-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('conversion keeps the original name and only numbers existing destinations', (t) => {
  const directory = createDirectory(t);
  const source = path.join(directory, 'Mes vacances.mov');
  fs.writeFileSync(source, 'original');
  const destination = getAvailableOutputPath(source, directory);
  assert.equal(path.basename(destination), 'Mes vacances.mp4');
  fs.writeFileSync(destination, 'first export');
  assert.equal(path.basename(getAvailableOutputPath(source, directory)), 'Mes vacances (2).mp4');
  assert.equal(
    path.basename(getAvailableOutputPath(destination, directory)),
    'Mes vacances (2).mp4'
  );
  assert.equal(fs.readFileSync(source, 'utf8'), 'original');
  assert.equal(fs.readFileSync(destination, 'utf8'), 'first export');
});

for (const operation of ['merge', 'recode', 'remux']) {
  test(`a ${operation} download keeps the accented title and cleans up its working files`, async (t) => {
    const directory = createDirectory(t);
    const previous = path.join(directory, 'Été à Dijon.mp4');
    if (operation === 'merge') fs.writeFileSync(previous, 'existing export');
    const mediaService = {
      inspect: async () => ({ height: 720, duration: 2 }),
      convert: async ({ outputDir, profileId, progressRange }) => {
        assert.equal(profileId, 'fast');
        assert.deepEqual(progressRange, [82, 99]);
        const output = path.join(outputDir, 'intermediate.mp4');
        fs.writeFileSync(output, 'encoded');
        return output;
      },
      remux: async (input) => {
        const output = path.join(path.dirname(input), 'intermediate.mp4');
        fs.writeFileSync(output, 'remuxed');
        return output;
      }
    };
    const service = new YouTubeService({
      ytDlpPath: '/yt-dlp',
      ffmpegPath: '/ffmpeg',
      mediaService,
      processRunner: async (_command, args, options) => {
        const stagingDir = args[args.indexOf('-P') + 1];
        assert.equal(path.dirname(stagingDir), directory);
        const downloaded = path.join(
          stagingDir,
          `Été à Dijon.${operation === 'recode' ? 'webm' : 'mp4'}`
        );
        fs.writeFileSync(downloaded, 'downloaded');
        const printed = Buffer.from(`__YTDLP_FILE__:${downloaded}\n`);
        const split = printed.indexOf(Buffer.from('É')) + 1;
        options.onStdout(printed.subarray(0, split));
        options.onStdout(printed.subarray(split));
        return { stdout: '', stderr: '' };
      }
    });
    const result = await service.download(
      {
        formatId: '137',
        outputDir: directory,
        url: 'https://youtu.be/test',
        mergeAudioIfNeeded: operation === 'merge',
        shouldRecodeToMp4: operation === 'recode'
      },
      new AbortController().signal,
      () => {}
    );
    assert.equal(
      path.basename(result.outputPath),
      operation === 'merge' ? 'Été à Dijon (2).mp4' : 'Été à Dijon.mp4'
    );
    assert.equal(
      fs.readFileSync(result.outputPath, 'utf8'),
      { merge: 'downloaded', recode: 'encoded', remux: 'remuxed' }[operation]
    );
    if (operation === 'merge') assert.equal(fs.readFileSync(previous, 'utf8'), 'existing export');
    assert.ok(fs.readdirSync(directory).every((name) => name.endsWith('.mp4')));
  });
}

test('cancelling a download removes only its partial working files', async (t) => {
  const directory = createDirectory(t);
  const previous = path.join(directory, 'Mes vacances.mp4');
  fs.writeFileSync(previous, 'existing export');
  const service = new YouTubeService({
    ytDlpPath: '/yt-dlp',
    ffmpegPath: '/ffmpeg',
    mediaService: {},
    processRunner: async (_command, args) => {
      fs.writeFileSync(path.join(args[args.indexOf('-P') + 1], 'partial.mp4.part'), 'partial');
      const error = new Error('Cancelled');
      error.name = 'AbortError';
      throw error;
    }
  });
  await assert.rejects(
    service.download(
      { formatId: '137', outputDir: directory, url: 'https://youtu.be/test' },
      new AbortController().signal,
      () => {}
    ),
    { name: 'AbortError' }
  );
  assert.deepEqual(fs.readdirSync(directory), ['Mes vacances.mp4']);
  assert.equal(fs.readFileSync(previous, 'utf8'), 'existing export');
});
