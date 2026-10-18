const fs = require('node:fs');

function isValidCommitMessage(message) {
  const title = message.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0];
  // Git-generated merges, reverts and autosquash commits keep their own syntax.
  if (/^(Merge |Revert "|fixup! |squash! )\S/.test(title)) return true;
  return /^(feat|fix|perf|refactor|docs|test|build|ci|chore|style|revert)(\([^()\r\n]+\))?!?: \S.*$/.test(
    title
  );
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file || !isValidCommitMessage(fs.readFileSync(file, 'utf8'))) {
    console.error(
      'Utilisez un message Conventional Commit, par exemple : refactor(ui): simplifier les hooks'
    );
    process.exitCode = 1;
  }
}
module.exports = { isValidCommitMessage };
