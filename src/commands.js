const { showMenu } = require('./menu');

const HELP = `أوامر الكيورا شيفر:
!مساعدة أو !help — عرض هذه الرسالة
!قائمة أو !menu — فتح القائمة التفاعلية النصية
!ping — فحص الاستجابة
!وقت أو !time — عرض الوقت المحلي
!عن أو !about — معلومات عن البوت`;

async function handleCommand(message, text) {
  const command = text.toLowerCase();

  if (['!مساعدة', '!help'].includes(command)) {
    await message.reply(HELP);
    return;
  }

  if (['!قائمة', '!menu'].includes(command)) {
    await showMenu(message);
    return;
  }

  if (command === '!ping') {
    await message.reply('حاضر ⚡ البوت متصل ويستجيب.');
    return;
  }

  if (['!وقت', '!time'].includes(command)) {
    const now = new Intl.DateTimeFormat('ar', {
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date());
    await message.reply(`الوقت المحلي للجهاز المشغّل للبوت:\n${now}`);
    return;
  }

  if (['!عن', '!about'].includes(command)) {
    await message.reply('أنا الكيورا شيفر، بوت واتساب عربي يعمل بـ Node.js عبر WhatsApp Web. قائمتي تفاعلية نصيًا وليست أزرارًا أصلية.');
  }
}

module.exports = { handleCommand };
