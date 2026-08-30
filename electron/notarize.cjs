const path = require('node:path');
const { execFileSync } = require('node:child_process');

module.exports = async function notarizeAfterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    try {
      execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'pipe' });
    } catch {
      console.log('Signature de développement non distribuable détectée, application d’une signature locale ad hoc valide.');
      execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--options', 'runtime', '--timestamp=none', appPath], { stdio: 'inherit' });
      execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
    }
    console.log('Notarisation ignorée: identifiants Apple absents.');
    return;
  }

  const { notarize } = require('@electron/notarize');
  await notarize({
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID
  });
};
