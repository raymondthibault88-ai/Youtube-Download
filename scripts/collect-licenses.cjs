const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'licenses', 'npm');
const project = require('../package.json');
const visited = new Set();
const packages = [];

function locatePackage(name, from) {
  let directory = from;
  while (true) {
    const candidate = path.join(directory, 'node_modules', name, 'package.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error(`Licence introuvable : paquet ${name} absent.`);
    directory = parent;
  }
}

function collect(name, from) {
  const manifestPath = locatePackage(name, from);
  if (visited.has(manifestPath)) return;
  visited.add(manifestPath);
  const directory = path.dirname(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const key = `${manifest.name.replaceAll('/', '__')}-${manifest.version}`;
  const licenseFiles = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^(licen[cs]e|copying|notice)([.-]|$)/i.test(entry.name))
    .map((entry) => entry.name);
  for (const file of licenseFiles) {
    const target = path.join(destination, key);
    fs.mkdirSync(target, { recursive: true });
    fs.copyFileSync(path.join(directory, file), path.join(target, file));
  }
  packages.push({ name: manifest.name, version: manifest.version, license: manifest.license || 'Consulter le paquet source', repository: manifest.repository || null, licenseFiles: licenseFiles.map((file) => `npm/${key}/${file}`) });
  for (const dependency of Object.keys(manifest.dependencies || {})) collect(dependency, directory);
}

for (const name of [...Object.keys(project.dependencies), 'react', 'react-dom', 'electron']) collect(name, root);
packages.sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));
fs.mkdirSync(destination, { recursive: true });
fs.writeFileSync(path.join(root, 'licenses', 'THIRD_PARTY_PACKAGES.json'), `${JSON.stringify(packages, null, 2)}\n`);

// Keep the provider's build configuration next to the binary's full licence.
const ffmpeg = require('ffmpeg-static');
for (const [extension, target] of [['LICENSE', 'FFmpeg-binary-LICENSE.txt'], ['README', `FFmpeg-${process.platform}-${process.arch}-BUILD.txt`]]) {
  const source = `${ffmpeg}.${extension}`;
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(root, 'licenses', target));
}
console.log(`Avis de licence collectés pour ${packages.length} paquets et le binaire FFmpeg.`);
