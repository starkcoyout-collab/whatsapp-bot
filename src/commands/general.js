const os = require('node:os');
const config = require('../config');
const { showMenu } = require('../lib/menu');
const { sendText } = require('../lib/text');
const { calculate } = require('../lib/calculator');

const help = `╭━━━〔 ✦ الكيورا شيفر ✦ 〕━━━╮
│ ✧ ${config.prefix}قائمة       القائمة التفاعلية
│ ✧ ${config.prefix}مساعدة      دليل الأوامر
│ ✧ ${config.prefix}ping        فحص الاتصال
│ ✧ ${config.prefix}وقت         الوقت المحلي
│ ✧ ${config.prefix}حاسبة       آلة حاسبة آمنة
│ ✧ ${config.prefix}تصويت       إنشاء تصويت
│ ✧ ${config.prefix}عن           معلومات البوت
│ ─── أوامر المجموعات ───
│ ✧ ${config.prefix}معلومات     تفاصيل المجموعة
│ ✧ ${config.prefix}رابط        رابط الدعوة (مشرف)
│ ✧ ${config.prefix}منشن        منشن صاحب الرسالة المقتبسة
│ ✧ ${config.prefix}قفل / ${config.prefix}فتح إعداد الكتابة (مشرف)
│ ✧ ${config.prefix}ترحيب تشغيل/إيقاف
╰ اكتب الأمر مع البادئة ${config.prefix} ✦╯`;

async function sendPoll(sock, message, argument, context) {
  const [question, ...choices] = argument.split('|').map((part) => part.trim()).filter(Boolean);
  if (!question || choices.length < 2 || choices.length > 12) {
    return sendText(sock, context.chatId, `الصيغة: ${config.prefix}تصويت السؤال؟ | خيار ١ | خيار ٢ (حتى ١٢ خيارًا)`, message);
  }
  await sock.sendMessage(context.chatId, {
    poll: { name: question.slice(0, 250), values: choices.map((choice) => choice.slice(0, 100)), selectableCount: 1 },
  });
}

const generalCommands = new Map();
for (const alias of ['مساعدة', 'help']) generalCommands.set(alias, (sock, msg, _arg, ctx) => sendText(sock, ctx.chatId, help, msg));
for (const alias of ['قائمة', 'menu']) generalCommands.set(alias, (sock, msg) => showMenu(sock, msg));
for (const alias of ['ping', 'فحص']) generalCommands.set(alias, (sock, msg, _arg, ctx) => sendText(sock, ctx.chatId, '⚡ متصل ومستعد. الكيورا شيفر يعمل.', msg));
for (const alias of ['وقت', 'time']) generalCommands.set(alias, (sock, msg, _arg, ctx) => {
  const now = new Intl.DateTimeFormat('ar', { dateStyle: 'full', timeStyle: 'short' }).format(new Date());
  return sendText(sock, ctx.chatId, `🕰️ الوقت المحلي لهذا الجهاز:\n${now}`, msg);
});
for (const alias of ['عن', 'about']) generalCommands.set(alias, (sock, msg, _arg, ctx) => {
  const uptime = Math.floor(process.uptime());
  const duration = `${Math.floor(uptime / 3600)}س ${Math.floor((uptime % 3600) / 60)}د`;
  return sendText(sock, ctx.chatId, `╭─「 ${config.name} 」\n│ Node.js + Baileys\n│ مدة التشغيل: ${duration}\n│ الذاكرة: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB\n│ النظام: ${os.platform()}\n╰ القائمة نصية تفاعلية؛ ليست أزرارًا أصلية.`, msg);
});
for (const alias of ['حاسبة', 'calc']) generalCommands.set(alias, (sock, msg, argument, ctx) => {
  try {
    if (!argument) throw new Error(`مثال: ${config.prefix}حاسبة (12+8)*3`);
    return sendText(sock, ctx.chatId, `🧮 الناتج: ${calculate(argument)}`, msg);
  } catch (error) {
    return sendText(sock, ctx.chatId, `⚠️ ${error.message}`, msg);
  }
});
for (const alias of ['تصويت', 'poll']) generalCommands.set(alias, sendPoll);

module.exports = { generalCommands };
