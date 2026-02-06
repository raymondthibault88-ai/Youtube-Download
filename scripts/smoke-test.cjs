const fs = require('node:fs');
const path = require('node:path');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const projectRoot = path.resolve(__dirname, '..');
const downloadConfigPath = path.join(projectRoot, 'shared', 'download-config.json');
const packageJsonPath = path.join(projectRoot, 'package.json');

const downloadConfig = readJson(downloadConfigPath);
const packageJson = readJson(packageJsonPath);

assert(typeof downloadConfig.quickDownloadFormatSelector === 'string', 'quickDownloadFormatSelector manquant.');
assert(downloadConfig.quickDownloadFormatSelector.includes('bestvideo'), 'quickDownloadFormatSelector doit inclure bestvideo.');
assert(downloadConfig.quickDownloadFormatSelector.includes('bestaudio'), 'quickDownloadFormatSelector doit inclure bestaudio.');
assert(typeof downloadConfig.outputTemplate === 'string', 'outputTemplate manquant.');
assert(downloadConfig.outputTemplate.includes('%(title)'), 'outputTemplate invalide.');
assert(downloadConfig.initialProgress && typeof downloadConfig.initialProgress === 'object', 'initialProgress manquant.');

assert(packageJson.scripts && packageJson.scripts.build, 'Script build manquant.');
assert(packageJson.scripts && packageJson.scripts.dist, 'Script dist manquant.');
assert(fs.existsSync(path.join(projectRoot, 'build', 'icons', 'icon.icns')), 'Icône macOS manquante.');
assert(fs.existsSync(path.join(projectRoot, 'build', 'icons', 'icon.ico')), 'Icône Windows manquante.');

console.log('Smoke test OK');
