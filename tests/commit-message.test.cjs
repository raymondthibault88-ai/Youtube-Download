const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidCommitMessage } = require('../scripts/check-commit-message.cjs');

test('commit conventions accept scopes, breaking changes, French text and Git-generated messages', () => {
  for (const message of [
    'fix: corriger',
    'refactor(ui): clarifier les réglages\n\nDétails.',
    'feat!: nouveau contrat',
    'feat(api)!: nouveau contrat',
    'Merge branch "main"',
    'Revert "fix: erreur"',
    'fixup! 5.1',
    'squash! fix(ui): libellé',
    '\uFEFFdocs: installation\r\n'
  ]) {
    assert.equal(isValidCommitMessage(message), true, message);
  }
});
test('commit conventions reject empty, ambiguous and malformed titles', () => {
  for (const message of [
    '',
    '5.1',
    'modifs',
    'fix:',
    'fix: ',
    'fix(ui) description',
    'unknown: description',
    'fix(): description',
    '\nfix: titre sur la mauvaise ligne'
  ]) {
    assert.equal(isValidCommitMessage(message), false, message);
  }
});
