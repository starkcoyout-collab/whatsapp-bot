require('dotenv').config();

module.exports = Object.freeze({
  name: 'الكيورا شيفر',
  prefix: process.env.PREFIX || '.',
  authDir: process.env.AUTH_DIR || 'baileys_auth_info',
  pairingNumber: process.env.PAIRING_NUMBER || '',
  logLevel: process.env.LOG_LEVEL || 'silent',
  commandCooldownMs: 1200,
  menuTimeoutMs: 2 * 60 * 1000,
  maxTextLength: 4000,
});
