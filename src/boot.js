import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { setTimeout as delay } from 'node:timers/promises';
import pino from 'pino';
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { config, ensureDirectories, digits } from './config.js';
import { Database } from './db.js';
import { Kernel } from './kernel.js';
import { wrapSendMessage } from './lib/wa.js';

const logger = pino({ level: 'silent' });
let shuttingDown = false;
let activeDb;

function suppressSignalNoise() {
  for (const method of ['log', 'info', 'warn', 'error']) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      const line = args.map((part) => typeof part === 'string' ? part : '').join(' ');
      if (/Closing session|Bad MAC/i.test(line)) return;
      original(...args);
    };
  }
}

function lockIsLive(lockFile) {
  try {
    const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    if (!Number.isInteger(lock.pid) || lock.pid <= 0) return false;
    const cmdline = fs.readFileSync(`/proc/${lock.pid}/cmdline`, 'utf8').replaceAll('\0', ' ');
    return /(?:^|\s)(?:node|nodejs)(?:\s|$)/.test(cmdline) && /(?:index\.js|ulquiorra)/i.test(cmdline);
  } catch { return false; }
}

function acquireLock() {
  if (fs.existsSync(config.lockFile)) {
    if (lockIsLive(config.lockFile)) throw new Error('يبدو أن نسخة أخرى من البوت تعمل بالفعل.');
    fs.rmSync(config.lockFile, { force: true });
  }
  fs.writeFileSync(config.lockFile, JSON.stringify({ pid: process.pid, startedAt: Date.now() }), { mode: 0o600, flag: 'wx' });
}

function releaseLock() {
  try {
    const lock = JSON.parse(fs.readFileSync(config.lockFile, 'utf8'));
    if (lock.pid === process.pid) fs.rmSync(config.lockFile, { force: true });
  } catch { /* lock already removed */ }
}

async function getPhoneNumber() {
  const fromEnv = digits(process.env.PAIRING_NUMBER || '');
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) throw new Error('أدخل رقم الاقتران الدولي في PAIRING_NUMBER عند التشغيل دون طرفية.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const phone = digits(await rl.question('أدخل رقم واتساب الدولي دون +: '));
    if (phone.length < 7 || phone.length > 15) throw new Error('رقم الهاتف غير صالح.');
    return phone;
  } finally { rl.close(); }
}

function statusCode(error) {
  return error?.output?.statusCode ?? error?.data?.statusCode ?? error?.statusCode;
}

export async function startBot() {
  ensureDirectories();
  acquireLock();
  suppressSignalNoise();
  activeDb = await new Database().init();
  const kernel = new Kernel({ sock: null, db: activeDb, runtimeConfig: config, logger: console });
  const moduleResult = await kernel.loadModules();
  console.log(`الكيورا | جاهز لتحميل الأوامر: ${moduleResult.commands}`);

  const shutdown = async (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try { await activeDb?.close(); } catch (e) { console.error('تعذر حفظ قاعدة البيانات:', e.message); }
    releaseLock();
    process.exitCode = code;
  };
  process.once('SIGINT', () => void shutdown(130));
  process.once('SIGTERM', () => void shutdown(0));
  process.once('uncaughtException', (error) => { console.error('خطأ غير معالج:', error); void shutdown(1); });

  let attempt = 0;
  while (!shuttingDown) {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
      const sock = makeWASocket({
        auth: state,
        logger,
        printQRInTerminal: false,
        browser: ['Ulquiorra', 'Chrome', '1.0'],
        markOnlineOnConnect: false,
        syncFullHistory: false
      });
      wrapSendMessage(sock, logger);
      kernel.setSocket(sock);
      kernel.attach();
      sock.ev.on('creds.update', saveCreds);

      if (!state.creds.registered) {
        const phone = await getPhoneNumber();
        const code = await sock.requestPairingCode(phone);
        console.log(`رمز ربط الكيورا: ${code}`);
        console.log('أدخل الرمز من واتساب ← الأجهزة المرتبطة ← ربط جهاز.');
      }

      const result = await new Promise((resolve) => {
        sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
          if (connection === 'open') { attempt = 0; console.log('تم الاتصال بواتساب.'); }
          if (connection === 'close') resolve(statusCode(lastDisconnect?.error));
        });
      });
      if (result === 440 || result === DisconnectReason.connectionReplaced) {
        console.log('استُبدل الاتصال بجهاز آخر؛ خروج آمن.');
        await shutdown(130);
        break;
      }
      if (result === DisconnectReason.loggedOut) {
        console.log('انتهت جلسة واتساب. احذف مجلد ./auth ثم شغّل البوت لإعادة الربط.');
        await shutdown(0);
        break;
      }
      if (shuttingDown) break;
      attempt += 1;
      const wait = Math.min(config.reconnect.baseMs * (2 ** Math.min(attempt - 1, 8)), config.reconnect.maxMs) + Math.floor(Math.random() * config.reconnect.jitterMs);
      console.log(`انقطع الاتصال؛ إعادة المحاولة بعد ${Math.ceil(wait / 1000)} ثانية.`);
      await delay(wait);
    } catch (error) {
      console.error('تعذر إنشاء اتصال واتساب:', error?.message || error);
      attempt += 1;
      await delay(Math.min(config.reconnect.baseMs * (2 ** Math.min(attempt - 1, 8)), config.reconnect.maxMs));
    }
  }
  releaseLock();
}
