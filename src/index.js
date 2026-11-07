const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const pino = require('pino');
const config = require('./config');
const { handleMessage } = require('./handlers/message');
const { welcomeNewMembers } = require('./commands/groups');

const logger = pino({ level: config.logLevel });
let baileys;
let stopping = false;
let reconnectTimer;
let reconnecting = false;
let activeSocket;
let pairingRequested = false;

function ask(question) {
  const terminal = readline.createInterface({ input: stdin, output: stdout });
  return terminal.question(question).finally(() => terminal.close());
}

function normalizePhoneNumber(value) {
  return value.replace(/[\s()+-]/g, '');
}

async function requestPairingCode(sock, state) {
  if (state.creds.registered || pairingRequested) return;
  pairingRequested = true;
  try {
    const entered = config.pairingNumber || (stdin.isTTY
      ? await ask('رقم واتساب مع رمز الدولة (مثال: 15551234567): ')
      : '');
    const phone = normalizePhoneNumber(entered);
    if (!/^\d{8,15}$/.test(phone)) {
      throw new Error('الرقم غير صالح. أوقف البوت، عيّن PAIRING_NUMBER في .env، ثم أعد التشغيل.');
    }
    const code = await sock.requestPairingCode(phone);
    console.log(`\n╭──「 رمز الاقتران 」──╮\n│  ${code}\n╰──────────────────╯\nواتساب ← الأجهزة المرتبطة ← ربط جهاز ← الربط برقم الهاتف. أدخل الرمز الظاهر أعلاه.`);
  } catch (error) {
    pairingRequested = false;
    logger.error({ err: error }, 'pairing code request failed');
    console.error(`تعذر إنشاء رمز الاقتران: ${error.message}`);
  }
}

async function startSocket() {
  const { state, saveCreds } = await baileys.useMultiFileAuthState(config.authDir);
  const sock = baileys.default({
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['Alquora Shiffer', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    markOnlineOn接收: false,
  });
  activeSocket = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    // Baileys emits a QR event as the signal that a new pairing attempt is available.
    // We never print or render the QR; request the phone-number pairing code instead.
    if (qr && !state.creds.registered) await requestPairingCode(sock, state);

    if (connection === 'open') {
      console.log(`\n✦ ${config.name} متصل وجاهز ✦`);
      pairingRequested = true;
      reconnecting = false;
    }
    if (connection !== 'close' || stopping) return;

    const status = lastDisconnect?.error?.output?.statusCode;
    if (status === baileys.DisconnectReason.loggedOut) {
      console.error(`تم تسجيل الخروج. احذف مجلد ${config.authDir} محليًا وأعد الاقتران بحسابك.`);
      return;
    }
    if (reconnecting) return;
    reconnecting = true;
    console.warn('انقطع الاتصال؛ إعادة المحاولة بعد 3 ثوانٍ.');
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(async () => {
      try {
        await startSocket();
      } catch (error) {
        reconnecting = false;
        logger.error({ err: error }, 'reconnect failed');
        console.error('تعذرت إعادة الاتصال:', error.message);
      }
    }, 3000);
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const message of messages) {
      try {
        await handleMessage(sock, message, baileys);
      } catch (error) {
        logger.error({ err: error }, 'message handler failed');
      }
    }
  });

  sock.ev.on('group-participants.update', async (event) => {
    try {
      await welcomeNewMembers(sock, event);
    } catch (error) {
      logger.error({ err: error }, 'welcome handler failed');
    }
  });
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  clearTimeout(reconnectTimer);
  console.log(`\nإيقاف البوت (${signal})...`);
  try {
    activeSocket?.end(undefined);
  } catch (error) {
    logger.warn({ err: error }, 'socket shutdown issue');
  }
  process.exit(0);
}

async function main() {
  baileys = await import('@whiskeysockets/baileys');
  await startSocket();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
main().catch((error) => {
  console.error('فشل تشغيل البوت:', error);
  process.exitCode = 1;
});
