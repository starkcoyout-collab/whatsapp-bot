import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = (...parts) => path.join(rootDir, ...parts);

export const config = Object.freeze({
  appName: 'Ulquiorra',
  botName: 'الكيورا',
  prefix: process.env.BOT_PREFIX || '.',
  rootDir,
  authDir: dir('auth'),
  dataDir: dir('data'),
  snapshotsDir: dir('data', 'snapshots'),
  modulesDir: dir('src', 'modules'),
  assetsDir: dir('assets'),
  fontsDir: dir('fonts'),
  lockFile: dir('ulquiorra.pid'),
  dbFile: dir('data', 'database.json'),
  ownerNumber: digits(process.env.OWNER_NUMBER || ''),
  mode: process.env.BOT_MODE === 'public' ? 'public' : 'self',
  reconnect: Object.freeze({ baseMs: 1500, maxMs: 30000, jitterMs: 800 }),
  limits: Object.freeze({ maxMediaBytes: 16 * 1024 * 1024, commandDedupeMs: 12000 }),
  logLevel: 'silent'
});

export function digits(value) {
  return String(value ?? '').replace(/[^\d]/g, '');
}

export function ensureDirectories() {
  for (const dirPath of [config.authDir, config.dataDir, config.snapshotsDir, config.modulesDir, config.assetsDir, config.fontsDir]) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
