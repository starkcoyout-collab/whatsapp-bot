const config = require('../config');
const { sendText } = require('./text');

const pending = new Map();
const choices = new Map([
  ['1', 'مساعدة'], ['١', 'مساعدة'],
  ['2', 'ping'], ['٢', 'ping'],
  ['3', 'وقت'], ['٣', 'وقت'],
  ['4', 'تصويت'], ['٤', 'تصويت'],
  ['5', 'معلومات'], ['٥', 'معلومات'],
]);

const MENU = `╭━━━━━━━━━━「 ✦ الكيورا شيفر ✦ 」━━━━━━━━━━╮
│     اختر زرًا بإرسال رقمه في المحادثة     │
├───────────────────────────────┤
│ ❶ المساعدة   ❷ فحص الاتصال   ❸ الوقت │
│ ❹ التصويت    ❺ معلومات المجموعة        │
├───────────────────────────────┤
│ القائمة تفاعلية نصيًا وليست أزرارًا أصلية │
╰ اكتب ${config.prefix}مساعدة لعرض كل الأوامر ╯`;

async function showMenu(sock, message) {
  pending.set(message.key.remoteJid, Date.now() + config.menuTimeoutMs);
  await sendText(sock, message.key.remoteJid, MENU, message);
}

async function handleMenuReply(sock, message, text) {
  const jid = message.key.remoteJid;
  const expiresAt = pending.get(jid);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    pending.delete(jid);
    return false;
  }
  const command = choices.get(text.trim());
  if (!command) return false;
  pending.delete(jid);
  const suffix = command === 'تصويت' ? ' مثال: .تصويت السؤال؟ | خيار ١ | خيار ٢' : '';
  await sendText(sock, jid, `اخترت: ${command}${suffix}\nاكتب ${config.prefix}${command}.`, message);
  return true;
}

module.exports = { showMenu, handleMenuReply };
