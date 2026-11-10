const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const yaml = require('js-yaml');

function mergeReleaseArtifacts(inputDir, outputDir, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Version stable invalide.');
  const targets = [
    {
      name: 'release-Windows-x64',
      channel: 'latest.yml',
      downloads: [`YouTube-Downloader-Setup-${version}-x64.exe`],
      extra: [`YouTube-Downloader-${version}-x64-portable.exe`]
    },
    ...['x64', 'arm64'].map((arch) => ({
      name: `release-macOS-${arch}`,
      channel: 'latest-mac.yml',
      downloads: ['zip', 'dmg'].map((ext) => `YouTube-Downloader-${version}-${arch}.${ext}`),
      extra: []
    }))
  ];
  const copies = [];
  const metadata = [];
  for (const target of targets) {
    const directory = path.join(inputDir, target.name);
    const info = yaml.load(fs.readFileSync(path.join(directory, target.channel), 'utf8'));
    if (info.version !== version) throw new Error(`Version incohérente : ${target.name}`);
    if (
      !Array.isArray(info.files) ||
      info.files.length !== target.downloads.length ||
      new Set(info.files.map((file) => file.url)).size !== target.downloads.length ||
      info.files.some((file) => !target.downloads.includes(file.url))
    )
      throw new Error(`Catalogue invalide : ${target.name}`);
    for (const file of info.files) {
      const bytes = fs.readFileSync(path.join(directory, file.url));
      if (
        file.size !== bytes.length ||
        file.sha512 !== createHash('sha512').update(bytes).digest('base64')
      )
        throw new Error(`Intégrité invalide : ${file.url}`);
    }
    const legacy = info.files.find((file) => file.url === info.path);
    if (!legacy || info.sha512 !== legacy.sha512)
      throw new Error(`Référence de mise à jour invalide : ${target.name}`);
    for (const name of [
      ...target.downloads,
      ...target.downloads.map((name) => `${name}.blockmap`),
      ...target.extra
    ]) {
      const source = path.join(directory, name);
      if (!fs.statSync(source).isFile()) throw new Error(`Fichier manquant : ${name}`);
      copies.push({ source, name });
    }
    metadata.push(info);
  }
  if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length)
    throw new Error('Le dossier de livraison doit être vide.');
  fs.mkdirSync(outputDir, { recursive: true });
  for (const { source, name } of copies) fs.copyFileSync(source, path.join(outputDir, name));
  const mac = { ...metadata[1], files: [...metadata[1].files, ...metadata[2].files] };
  fs.writeFileSync(path.join(outputDir, 'latest.yml'), yaml.dump(metadata[0]));
  fs.writeFileSync(path.join(outputDir, 'latest-mac.yml'), yaml.dump(mac));
  return { version, files: copies.length + 2 };
}

if (require.main === module) {
  const [input, output, version] = process.argv.slice(2);
  if (!input || !output || !version) throw new Error('Usage : input output version');
  console.log(JSON.stringify(mergeReleaseArtifacts(input, output, version)));
}

module.exports = { mergeReleaseArtifacts };
