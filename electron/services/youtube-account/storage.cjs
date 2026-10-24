const fs = require('node:fs');
const path = require('node:path');
const nodeCrypto = require('node:crypto');
const { accountError } = require('./oauth.cjs');

function parseConfig(value) {
  const installed = value?.installed;
  if (!installed || typeof installed !== 'object') {
    throw accountError('Choisissez le fichier OAuth Google d’une application de bureau.');
  }
  const clientId = installed.client_id;
  const clientSecret = installed.client_secret;
  if (
    typeof clientId !== 'string' ||
    !/^[\w.-]{1,256}\.apps\.googleusercontent\.com$/.test(clientId)
  ) {
    throw accountError('L’identifiant client Google est invalide.');
  }
  if (
    clientSecret !== undefined &&
    (typeof clientSecret !== 'string' ||
      clientSecret.length > 1024 ||
      /[\r\n\0]/.test(clientSecret))
  ) {
    throw accountError('La configuration Google est invalide.');
  }
  return { clientId, ...(clientSecret ? { clientSecret } : {}) };
}

async function readConfigFile(filename) {
  const stats = await fs.promises.stat(filename);
  if (!stats.isFile() || stats.size > 65536)
    throw accountError('Le fichier de configuration Google est invalide.');
  let content;
  try {
    content = JSON.parse((await fs.promises.readFile(filename, 'utf8')).replace(/^\uFEFF/, ''));
  } catch {
    throw accountError('Le fichier de configuration Google ne peut pas être lu.');
  }
  return parseConfig(content);
}

async function atomicWrite(filename, content) {
  await fs.promises.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${nodeCrypto.randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(temporary, content, { mode: 0o600 });
    await fs.promises.rename(temporary, filename);
  } finally {
    await fs.promises.unlink(temporary).catch(() => {});
  }
}

function canEncrypt(safeStorage) {
  try {
    return Boolean(
      safeStorage?.isEncryptionAvailable?.() &&
      safeStorage.getSelectedStorageBackend?.() !== 'basic_text' &&
      typeof safeStorage.encryptString === 'function' &&
      typeof safeStorage.decryptString === 'function'
    );
  } catch {
    return false;
  }
}

async function saveRefreshToken(filename, credentials, config, safeStorage) {
  if (!canEncrypt(safeStorage))
    throw accountError('Le stockage sécurisé de cet ordinateur est indisponible.');
  const payload = JSON.stringify({
    clientId: config.clientId,
    refreshToken: credentials.refreshToken
  });
  try {
    const encrypted = safeStorage.encryptString(payload);
    if (!Buffer.isBuffer(encrypted) || !encrypted.length) throw new Error();
    await atomicWrite(filename, encrypted);
  } catch {
    throw accountError(
      'Impossible d’enregistrer la connexion dans le stockage sécurisé. Réessayez.'
    );
  }
}

async function loadRefreshToken(filename, config, safeStorage) {
  if (!config || !canEncrypt(safeStorage)) return null;
  try {
    const encrypted = await fs.promises.readFile(filename);
    if (encrypted.length > 65536) throw new Error();
    const value = JSON.parse(safeStorage.decryptString(encrypted));
    if (
      value.clientId !== config.clientId ||
      typeof value.refreshToken !== 'string' ||
      !value.refreshToken ||
      value.refreshToken.length > 16384
    )
      return null;
    return value.refreshToken;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw accountError(
      'La connexion enregistrée ne peut pas être relue. Reconnectez votre compte.'
    );
  }
}

async function deleteRefreshToken(filename) {
  try {
    await fs.promises.unlink(filename);
  } catch (error) {
    if (error.code !== 'ENOENT')
      throw accountError('Impossible de supprimer la connexion enregistrée. Réessayez.');
  }
}

module.exports = {
  atomicWrite,
  canEncrypt,
  deleteRefreshToken,
  loadRefreshToken,
  parseConfig,
  readConfigFile,
  saveRefreshToken
};
