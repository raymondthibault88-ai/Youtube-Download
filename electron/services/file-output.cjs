const fs = require('node:fs');
const path = require('node:path');

// Publish atomically without ever replacing a file belonging to another task.
async function publishFile(source, requestedPath, signal) {
  const parsed = path.parse(requestedPath);
  for (let index = 1; ; index += 1) {
    signal?.throwIfAborted();
    const destination = index === 1 ? requestedPath : path.join(parsed.dir, `${parsed.name} ${index}${parsed.ext}`);
    try {
      try {
        await fs.promises.link(source, destination);
      } catch (error) {
        if (!['EXDEV', 'EPERM', 'ENOTSUP', 'EOPNOTSUPP'].includes(error.code)) throw error;
        await fs.promises.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
      }
      await fs.promises.unlink(source);
      return destination;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}

module.exports = { publishFile };
