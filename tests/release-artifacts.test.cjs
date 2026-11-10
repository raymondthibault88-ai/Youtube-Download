const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const yaml = require('js-yaml');
const { mergeReleaseArtifacts } = require('../scripts/merge-release-artifacts.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube-release-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = path.join(root, 'input');
  const output = path.join(root, 'output');
  const version = '5.1.5';
  for (const target of ['Windows-x64', 'macOS-x64', 'macOS-arm64']) {
    const directory = path.join(input, `release-${target}`);
    fs.mkdirSync(directory, { recursive: true });
    const downloads = target.startsWith('Windows')
      ? [`YouTube-Downloader-Setup-${version}-x64.exe`]
      : ['zip', 'dmg'].map((ext) => `YouTube-Downloader-${version}-${target.slice(6)}.${ext}`);
    const files = downloads.map((url) => {
      const data = Buffer.from(`Artifact for ${url}`);
      fs.writeFileSync(path.join(directory, url), data);
      fs.writeFileSync(path.join(directory, `${url}.blockmap`), 'block map');
      return { url, size: data.length, sha512: createHash('sha512').update(data).digest('base64') };
    });
    if (target.startsWith('Windows'))
      fs.writeFileSync(
        path.join(directory, `YouTube-Downloader-${version}-x64-portable.exe`),
        'portable'
      );
    fs.writeFileSync(
      path.join(directory, target.startsWith('Windows') ? 'latest.yml' : 'latest-mac.yml'),
      yaml.dump({ version, files, path: files[0].url, sha512: files[0].sha512 })
    );
  }
  return { input, output, version };
}

test('release combines Intel and Apple Silicon update catalogs and keeps Windows separate', (t) => {
  const { input, output, version } = fixture(t);
  assert.deepEqual(mergeReleaseArtifacts(input, output, version), { version, files: 13 });
  const mac = yaml.load(fs.readFileSync(path.join(output, 'latest-mac.yml'), 'utf8'));
  assert.equal(mac.files.length, 4);
  assert.equal(mac.files.filter((file) => file.url.includes('arm64')).length, 2);
  assert.equal(mac.files.filter((file) => file.url.includes('x64')).length, 2);
  const windows = yaml.load(fs.readFileSync(path.join(output, 'latest.yml'), 'utf8'));
  assert.equal(windows.files.length, 1);
  assert.match(windows.files[0].url, /Setup.*\.exe$/);
  assert.equal(fs.readdirSync(output).length, 13);
});

for (const mutation of [
  'wrong version',
  'changed bytes',
  'missing archive',
  'foreign path',
  'missing blockmap'
])
  test(`release refuses ${mutation} before writing files`, (t) => {
    const { input, output, version } = fixture(t);
    const directory = path.join(input, 'release-macOS-arm64');
    const metadataPath = path.join(directory, 'latest-mac.yml');
    const info = yaml.load(fs.readFileSync(metadataPath, 'utf8'));
    if (mutation === 'wrong version') info.version = '5.1.4';
    if (mutation === 'changed bytes')
      fs.appendFileSync(path.join(directory, info.files[0].url), 'bad');
    if (mutation === 'missing archive') fs.unlinkSync(path.join(directory, info.files[0].url));
    if (mutation === 'foreign path') info.files[0].url = '../secret.zip';
    if (mutation === 'missing blockmap')
      fs.unlinkSync(path.join(directory, `${info.files[0].url}.blockmap`));
    fs.writeFileSync(metadataPath, yaml.dump(info));
    assert.throws(() => mergeReleaseArtifacts(input, output, version));
    assert.equal(fs.existsSync(output), false);
  });
