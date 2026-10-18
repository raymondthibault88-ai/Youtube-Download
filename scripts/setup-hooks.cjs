const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const configured = git(['config', '--get', '--default=', 'core.hooksPath']);
if (configured && configured !== '.githooks') {
  throw new Error(
    `Des hooks sont déjà configurés dans ${configured}. Intégrez les hooks du projet sans remplacer cette configuration.`
  );
}
for (const name of ['pre-commit', 'commit-msg']) {
  fs.chmodSync(path.join(root, '.githooks', name), 0o755);
}
git(['config', '--local', 'core.hooksPath', '.githooks']);
console.log('Hooks du projet activés : formatage, lint, types et Conventional Commits.');
