const path = require('node:path');

const builderPlatform = { darwin: 'mac', win32: 'win', linux: 'linux' };

function ffmpegBuildPath(platform = process.platform, arch = process.arch) {
  return path.join(
    __dirname,
    '..',
    '..',
    'build',
    'ffmpeg-bundles',
    `${builderPlatform[platform]}-${arch}`,
    platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  );
}

function ffmpegPath(resourcesPath) {
  const executable = ffmpegBuildPath();
  return resourcesPath ? path.join(resourcesPath, 'ffmpeg', path.basename(executable)) : executable;
}

module.exports = { ffmpegBuildPath, ffmpegPath };
