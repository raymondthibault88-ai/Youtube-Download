const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const nodeCrypto = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

async function matchesHash(file, expected) {
  try {
    const hash = nodeCrypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest('hex') === expected;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function downloadArchive(url, destination) {
  if (new URL(url).protocol !== 'https:') throw new Error('Source FFmpeg HTTPS requise.');
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok || !response.body) throw new Error(`Téléchargement FFmpeg : HTTP ${response.status}.`);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination, { flags: 'wx' }));
}

async function prepareWindowsFfmpeg({
  directory = path.join(__dirname, '..', 'build', 'ffmpeg', 'win32-x64'),
  cacheDirectory = path.join(os.tmpdir(), 'youtube-downloader-ffmpeg'),
  download = downloadArchive
} = {}) {
  const manifest = JSON.parse(await fs.promises.readFile(path.join(directory, 'manifest.json'), 'utf8'));
  const binary = path.join(directory, 'ffmpeg.exe');
  if (await matchesHash(binary, manifest.sha256)) return binary;
  if (!/^[a-f0-9]{64}$/.test(manifest.archiveSha256) || !/^[a-f0-9]{64}$/.test(manifest.sha256)) throw new Error('Empreintes FFmpeg invalides.');
  if (!manifest.archiveEntry || manifest.archiveEntry.split(/[\\/]/).some(part => part === '..') || path.isAbsolute(manifest.archiveEntry)) throw new Error('Chemin FFmpeg invalide dans l’archive.');
  await fs.promises.mkdir(cacheDirectory, { recursive: true });
  const archive = path.join(cacheDirectory, `${manifest.archiveSha256}.zip`);
  const temporary = await fs.promises.mkdtemp(path.join(cacheDirectory, 'prepare-'));
  let staging;
  try {
    if (!(await matchesHash(archive, manifest.archiveSha256))) {
      const pending = path.join(temporary, 'download.zip');
      await download(manifest.source, pending);
      if (!(await matchesHash(pending, manifest.archiveSha256))) throw new Error('Intégrité de l’archive FFmpeg invalide.');
      await fs.promises.rename(pending, archive);
    }
    const { extract } = await import('@electron-internal/extract-zip');
    const extracted = path.join(temporary, 'extracted');
    await extract(archive, { dir: extracted });
    const source = path.join(extracted, manifest.archiveEntry);
    if (!(await matchesHash(source, manifest.sha256))) throw new Error('Intégrité du binaire FFmpeg invalide.');
    staging = path.join(directory, `.ffmpeg-${nodeCrypto.randomUUID()}.tmp`);
    await fs.promises.copyFile(source, staging, fs.constants.COPYFILE_EXCL);
    await fs.promises.rename(staging, binary);
    return binary;
  } finally {
    if (staging) await fs.promises.rm(staging, { force: true });
    await fs.promises.rm(temporary, { recursive: true, force: true });
  }
}

if (require.main === module) prepareWindowsFfmpeg().then(() => {
  console.log('FFmpeg Windows x64 prêt : archive et binaire vérifiés.');
}).catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { prepareWindowsFfmpeg };
