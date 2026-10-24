const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MediaService } = require('../electron/services/media.cjs');
const {
  getAvailableOutputPath,
  publishOutputFile
} = require('../electron/services/output-files.cjs');

function directory(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'video-v5-publication-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

const mediaInfo = {
  width: 1920,
  height: 1080,
  duration: 3,
  bitrate: 5000000,
  codec: 'h264',
  pixelFormat: 'yuv420p',
  highDynamicRange: false,
  rotation: 0,
  interlaced: false
};

test('a file created during encoding is preserved and the completed export gets the next simple name', async (t) => {
  const root = directory(t);
  const inputPath = path.join(root, 'Match é.mov');
  const collision = path.join(root, 'Match é.mp4');
  fs.writeFileSync(inputPath, 'original');
  let encodes = 0;
  const service = new MediaService('/unused', {
    processRunner: async (_command, args) => {
      encodes++;
      fs.writeFileSync(collision, 'external file created during encoding');
      fs.writeFileSync(args.at(-1), 'complete video');
    }
  });
  service.detectHardwareEncoder = async () => null;
  const output = await service.convert({ inputPath, outputDir: root, mediaInfo });
  assert.equal(path.basename(output), 'Match é (2).mp4');
  assert.equal(fs.readFileSync(collision, 'utf8'), 'external file created during encoding');
  assert.equal(fs.readFileSync(output, 'utf8'), 'complete video');
  assert.equal(fs.readFileSync(inputPath, 'utf8'), 'original');
  assert.equal(encodes, 1);
  assert.ok(!fs.readdirSync(root).some((name) => name.endsWith('.tmp.mp4')));
});

test('a decoder retry retains the original naming base when a numbered destination is taken late', async (t) => {
  const root = directory(t);
  const inputPath = path.join(root, 'Match.mov');
  fs.writeFileSync(inputPath, 'original');
  fs.writeFileSync(path.join(root, 'Match.mp4'), 'previous export');
  let attempts = 0;
  const service = new MediaService('/unused', {
    processRunner: async (_command, args) => {
      attempts++;
      fs.writeFileSync(args.at(-1), 'video');
      if (attempts === 1) throw new Error('GPU decoder unavailable');
      fs.writeFileSync(path.join(root, 'Match (2).mp4'), 'external numbered file');
    }
  });
  service.detectHardwareEncoder = async () => 'h264_qsv';
  const output = await service.convert({ inputPath, outputDir: root, mediaInfo });
  assert.equal(path.basename(output), 'Match (3).mp4');
  assert.equal(fs.readFileSync(path.join(root, 'Match.mp4'), 'utf8'), 'previous export');
  assert.equal(fs.readFileSync(path.join(root, 'Match (2).mp4'), 'utf8'), 'external numbered file');
  assert.equal(fs.readFileSync(inputPath, 'utf8'), 'original');
  assert.equal(attempts, 2);
});

test('remux publication also preserves a destination that appears during processing', async (t) => {
  const root = directory(t);
  const inputPath = path.join(root, 'Owned download.mkv');
  const collision = path.join(root, 'Owned download.mp4');
  fs.writeFileSync(inputPath, 'owned staging input');
  const service = new MediaService('/unused', {
    processRunner: async (_command, args) => {
      fs.writeFileSync(collision, 'external export');
      fs.writeFileSync(args.at(-1), 'remuxed');
    }
  });
  const output = await service.remux(inputPath);
  assert.equal(path.basename(output), 'Owned download (2).mp4');
  assert.equal(fs.readFileSync(collision, 'utf8'), 'external export');
  assert.equal(fs.readFileSync(output, 'utf8'), 'remuxed');
  assert.equal(fs.existsSync(inputPath), false);
});

test('the no-hard-link fallback refuses an intervening file and copies to the next available name', async (t) => {
  const root = directory(t);
  const source = path.join(root, '.owned.tmp.mp4');
  const destination = path.join(root, 'Match.mp4');
  fs.writeFileSync(source, 'completed video');
  let inserted = false;
  t.mock.method(fs.promises, 'link', async (_source, target) => {
    if (!inserted) {
      fs.writeFileSync(target, 'external file');
      inserted = true;
    }
    throw Object.assign(new Error('No hard links on this volume'), { code: 'ENOTSUP' });
  });
  const copyFile = fs.promises.copyFile;
  let copies = 0;
  t.mock.method(fs.promises, 'copyFile', async (from, target, flags) => {
    copies++;
    assert.ok(flags & fs.constants.COPYFILE_EXCL);
    return copyFile(from, target, flags);
  });
  const output = await publishOutputFile(source, destination);
  assert.equal(path.basename(output), 'Match (2).mp4');
  assert.equal(fs.readFileSync(destination, 'utf8'), 'external file');
  assert.equal(fs.readFileSync(output, 'utf8'), 'completed video');
  assert.equal(fs.existsSync(source), false);
  assert.equal(copies, 2);
});

test('cleanup failure after a successful publication does not discard the completed export', async (t) => {
  const root = directory(t);
  const source = path.join(root, '.owned.tmp.mp4');
  const destination = path.join(root, 'Match.mp4');
  fs.writeFileSync(source, 'completed video');
  const unlink = fs.promises.unlink;
  t.mock.method(fs.promises, 'unlink', async (target) => {
    if (target === source)
      throw Object.assign(new Error('File temporarily locked'), { code: 'EBUSY' });
    return unlink(target);
  });
  assert.equal(await publishOutputFile(source, destination), destination);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'completed video');
});

test('publishing onto the temporary path itself is rejected without deleting it', async (t) => {
  const root = directory(t);
  const source = path.join(root, 'Match.mp4');
  fs.writeFileSync(source, 'keep');
  await assert.rejects(publishOutputFile(source, source));
  assert.equal(fs.readFileSync(source, 'utf8'), 'keep');
});

test('an existing directory entry with a broken link target still reserves its output name', (t) => {
  const root = directory(t);
  const input = path.join(root, 'Match.mov');
  const reserved = path.join(root, 'Match.mp4');
  const lstat = fs.lstatSync;
  t.mock.method(fs, 'lstatSync', (filename, options) => {
    if (filename === reserved) return { isSymbolicLink: () => true };
    return lstat(filename, options);
  });
  assert.equal(fs.existsSync(reserved), false);
  assert.equal(path.basename(getAvailableOutputPath(input, root)), 'Match (2).mp4');
});
