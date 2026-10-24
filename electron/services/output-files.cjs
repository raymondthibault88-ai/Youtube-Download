const fs = require('node:fs');
const path = require('node:path');

function getAvailableOutputPath(inputPath, outputDir) {
  const parsed = path.parse(inputPath);
  const destinationDir = outputDir || parsed.dir;
  const baseName = parsed.name;
  let candidate = path.join(destinationDir, `${baseName}.mp4`);
  let index = 2;
  while (fs.lstatSync(candidate, { throwIfNoEntry: false })) {
    candidate = path.join(destinationDir, `${baseName} (${index}).mp4`);
    index += 1;
  }
  return candidate;
}

const NO_HARD_LINK = new Set(['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV']);

async function createExclusiveFile(source, destination) {
  try {
    // The temporary and final file normally share a filesystem: no media copy.
    await fs.promises.link(source, destination);
  } catch (error) {
    if (!NO_HARD_LINK.has(error.code)) throw error;
    // FAT and some network drives cannot create hard links. Keep exclusivity
    // on the fallback too; a new file must never replace an existing export.
    await fs.promises.copyFile(
      source,
      destination,
      fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE
    );
  }
}

async function publishOutputFile(source, destination, nameBase = destination) {
  const comparable = (value) =>
    process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  if (comparable(source) === comparable(destination))
    throw new Error('Le fichier temporaire doit être distinct de la destination.');
  const outputDir = path.dirname(destination);
  let candidate = destination;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await createExclusiveFile(source, candidate);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = await fs.promises.lstat(candidate).catch((statError) => {
        if (statError.code !== 'ENOENT') throw statError;
        return null;
      });
      if (existing?.isDirectory()) throw error;
      candidate = getAvailableOutputPath(nameBase, outputDir);
      continue;
    }
    // Publication has succeeded. A cleanup error must not turn a completed
    // export into a failure or cause the final file to be removed.
    await fs.promises.unlink(source).catch(() => {});
    return candidate;
  }
  throw new Error('Le dossier est modifié par un autre programme. Réessayez l’export.');
}

module.exports = { getAvailableOutputPath, publishOutputFile };
