const fs = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { promisify } = require('node:util');
const { createGzip } = require('node:zlib');
const {
  downloadGitHubAsset,
  verifyFileHash
} = require('../electron/services/verified-download.cjs');
const { ffmpegBuildPath } = require('../electron/services/ffmpeg-path.cjs');
const { builds, release } = require('./ffmpeg-assets.json');

const extract = promisify(execFile);
const plainNotices = 'THIRD_PARTY_NOTICES.txt';
const compressedNotices = `${plainNotices}.gz`;
const licenseFiles = ['FFmpeg-GPL-3.0.txt', 'SOURCE.txt', 'PROVENANCE.json'];
const noticeFiles = [...licenseFiles, compressedNotices];

async function prepareFfmpeg(platform, arch) {
  const asset = builds[`${platform}-${arch}`];
  if (!asset) throw new Error(`FFmpeg indisponible pour ${platform}-${arch}.`);

  const executable = ffmpegBuildPath(platform, arch);
  const directory = path.dirname(executable);
  const name = path.basename(executable);
  try {
    await verifyFileHash(executable, asset.binarySha256, 'FFmpeg');
    await Promise.all(noticeFiles.map((file) => fs.access(path.join(directory, file))));
    await fs.chmod(executable, 0o755);
    return;
  } catch {
    await fs.mkdir(directory, { recursive: true });
  }

  const staging = await fs.mkdtemp(path.join(path.dirname(directory), '.ffmpeg-'));
  try {
    const archive = path.join(staging, asset.archive);
    await downloadGitHubAsset(`${release}/${asset.archive}`, archive, 'FFmpeg');
    await verifyFileHash(archive, asset.archiveSha256, 'FFmpeg');
    await extract('tar', ['-xf', archive, '-C', staging, ...licenseFiles, plainNotices, name], {
      windowsHide: true
    });
    await verifyFileHash(path.join(staging, name), asset.binarySha256, 'FFmpeg');
    await pipeline(
      createReadStream(path.join(staging, plainNotices)),
      createGzip(),
      createWriteStream(path.join(staging, compressedNotices))
    );
    await fs.chmod(path.join(staging, name), 0o755);
    // Publish the verified executable after its notices are in place.
    for (const file of [...noticeFiles, name])
      await fs.rename(path.join(staging, file), path.join(directory, file));
    console.log(`FFmpeg vérifié pour ${platform}-${arch}.`);
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

module.exports = async ({ electronPlatformName, arch }) => {
  const { Arch } = require('electron-builder');
  await prepareFfmpeg(electronPlatformName, Arch[arch]);
};

if (require.main === module) {
  prepareFfmpeg(process.platform, process.arch).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
