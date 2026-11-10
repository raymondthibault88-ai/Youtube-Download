const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

module.exports = async function notarizeAfterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  const required = process.env.MAC_AUTO_UPDATE_REQUIRED === 'true';
  if (required && (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID))
    throw new Error('La distribution Mac exige les identifiants de notarisation Apple.');
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    try {
      execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], {
        stdio: 'pipe'
      });
    } catch {
      console.log(
        'Signature de développement non distribuable détectée, application d’une signature locale ad hoc valide.'
      );
      execFileSync(
        '/usr/bin/codesign',
        ['--force', '--deep', '--sign', '-', '--options', 'runtime', '--timestamp=none', appPath],
        { stdio: 'inherit' }
      );
      execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], {
        stdio: 'inherit'
      });
    }
    console.log('Notarisation ignorée: identifiants Apple absents.');
    return;
  }

  const signature = spawnSync('/usr/bin/codesign', ['--display', '--verbose=2', appPath], {
    encoding: 'utf8'
  });
  if (
    signature.status !== 0 ||
    !/^Authority=Developer ID Application:/m.test(signature.stderr || '') ||
    !(signature.stderr || '').split('\n').includes(`TeamIdentifier=${APPLE_TEAM_ID}`)
  )
    throw new Error(
      'La distribution Mac exige une signature Developer ID de la bonne équipe Apple.'
    );
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'pipe' });
  const { notarize } = require('@electron/notarize');
  await notarize({
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID
  });
  execFileSync('/usr/bin/xcrun', ['stapler', 'validate', appPath], { stdio: 'pipe' });
};
