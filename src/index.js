const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { handleCommand } = require('./commands');
const { handleMenuReply } = require('./menu');

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'alquora-shiffer' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', (qr) => {
  console.log('\nامسح رمز QR من واتساب ← الأجهزة المرتبطة ← ربط جهاز:\n');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => console.log('تم التحقق من الحساب.'));
client.on('ready', () => console.log('الكيورا شيفر جاهز. أوقفه بـ Ctrl+C.'));
client.on('auth_failure', (message) => {
  console.error('فشل تسجيل الدخول:', message);
});
client.on('disconnected', (reason) => {
  console.warn('انقطع اتصال واتساب:', reason);
});

client.on('message', async (message) => {
  // لا ترد على رسائل الحساب نفسه أو الرسائل التي أرسلها البوت.
  if (message.fromMe || !message.body) return;

  const text = message.body.trim();
  try {
    if (await handleMenuReply(message, text)) return;
    await handleCommand(message, text);
  } catch (error) {
    console.error('تعذر التعامل مع رسالة:', error);
    await message.reply('صار خطأ أثناء تنفيذ الطلب. جرّب مرة ثانية أو اكتب !مساعدة.');
  }
});

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`\nإيقاف البوت (${signal})...`);
  try {
    await client.destroy();
  } catch (error) {
    console.error('تعذر إغلاق الاتصال بشكل نظيف:', error.message);
  } finally {
    process.exit(0);
  }
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

client.initialize().catch((error) => {
  console.error('فشل تشغيل عميل واتساب:', error);
  process.exitCode = 1;
});
