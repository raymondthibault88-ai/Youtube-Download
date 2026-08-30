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
const ipcPath = path.join(projectRoot, 'shared', 'ipc.json');
const conversionConfigPath = path.join(projectRoot, 'shared', 'conversion-config.json');

const downloadConfig = readJson(downloadConfigPath);
const packageJson = readJson(packageJsonPath);
const ipc = readJson(ipcPath);
const conversionConfig = readJson(conversionConfigPath);

assert(typeof downloadConfig.outputTemplate === 'string', 'outputTemplate manquant.');
assert(downloadConfig.outputTemplate.includes('%(title)'), 'outputTemplate invalide.');
assert(downloadConfig.initialProgress && typeof downloadConfig.initialProgress === 'object', 'initialProgress manquant.');

assert(packageJson.scripts && packageJson.scripts.build, 'Script build manquant.');
assert(packageJson.scripts && packageJson.scripts.dist, 'Script dist manquant.');
assert(packageJson.version === '3.0.0', 'La version de l’application doit être 3.0.0.');
assert(ipc.invoke.dialogSelectVideo === 'dialog:selectVideo', 'Canal de sélection vidéo manquant.');
assert(ipc.invoke.conversionStart === 'conversion:start', 'Canal de conversion manquant.');
assert(ipc.events.conversionProgress === 'conversion:progress', 'Canal de progression de conversion manquant.');
assert(ipc.invoke.jobCancel === 'job:cancel', 'Canal d’annulation de tâche manquant.');
assert(ipc.events.jobUpdate === 'job:update', 'Canal de suivi unifié manquant.');
assert(conversionConfig.audioBitrate > 0, 'Débit audio de conversion invalide.');
assert(Array.isArray(conversionConfig.profiles) && conversionConfig.profiles.length > 0, 'Profils de conversion manquants.');
assert(Array.isArray(conversionConfig.speedProfiles) && conversionConfig.speedProfiles.length === 3, 'Profils de vitesse manquants.');
assert(
  conversionConfig.profiles.every((profile, index, profiles) => index === 0 || profile.minHeight < profiles[index - 1].minHeight),
  'Les profils de conversion doivent être triés par résolution décroissante.'
);
assert(fs.existsSync(path.join(projectRoot, 'build', 'icons', 'icon.icns')), 'Icône macOS manquante.');
assert(fs.existsSync(path.join(projectRoot, 'build', 'icons', 'icon.ico')), 'Icône Windows manquante.');

const preloadSource = fs.readFileSync(path.join(projectRoot, 'electron', 'preload.cjs'), 'utf8');
for (const channel of [...Object.values(ipc.invoke), ...Object.values(ipc.events)]) {
  assert(preloadSource.includes(`'${channel}'`), `Le preload n’expose pas le canal ${channel}.`);
}

console.log('Smoke test OK');
