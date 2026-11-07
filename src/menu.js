const MENU_TIMEOUT_MS = 2 * 60 * 1000;
const pendingMenus = new Map();

const OPTIONS = new Map([
  ['1', ['١', '1']],
  ['2', ['٢', '2']],
  ['3', ['٣', '3']],
  ['4', ['٤', '4']],
]);

function menuText() {
  return [
    '╭─「 الكيورا شيفر 」',
    '│ اختر بإرسال رقم الخيار:',
    '│ 1 — المساعدة',
    '│ 2 — فحص الاتصال',
    '│ 3 — الوقت المحلي',
    '│ 4 — عن البوت',
    '╰ أرسل !قائمة لإعادة فتح القائمة.',
    'تنتهي صلاحية الاختيار بعد دقيقتين.',
  ].join('\n');
}

async function showMenu(message) {
  pendingMenus.set(message.from, Date.now() + MENU_TIMEOUT_MS);
  await message.reply(menuText());
}

async function handleMenuReply(message, text) {
  const expiresAt = pendingMenus.get(message.from);
  if (!expiresAt) return false;

  if (Date.now() > expiresAt) {
    pendingMenus.delete(message.from);
    return false;
  }

  const normalized = text.trim();
  let choice;
  for (const [key, variants] of OPTIONS) {
    if (variants.includes(normalized)) {
      choice = key;
      break;
    }
  }

  if (!choice) return false;
  pendingMenus.delete(message.from);

  const replies = {
    '1': 'اكتب !مساعدة لعرض قائمة الأوامر.',
    '2': 'حاضر ⚡ البوت متصل ويستجيب.',
    '3': `الوقت المحلي للجهاز المشغّل للبوت: ${new Intl.DateTimeFormat('ar', { dateStyle: 'full', timeStyle: 'short' }).format(new Date())}`,
    '4': 'أنا الكيورا شيفر، بوت عربي يعمل بـ Node.js عبر WhatsApp Web. هذه قائمة نصية وليست أزرارًا أصلية.',
  };

  await message.reply(replies[choice]);
  return true;
}

module.exports = { showMenu, handleMenuReply };
