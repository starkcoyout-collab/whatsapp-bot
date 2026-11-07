const config = require('../config');
const { sendText, senderId, phoneDigits } = require('../lib/text');
const { groupSettings } = require('../lib/store');
const { getAdminState } = require('../lib/permissions');

async function requireGroup(sock, message, context) {
  if (context.group) return true;
  await sendText(sock, context.chatId, 'هذا الأمر يعمل داخل مجموعة فقط.', message);
  return false;
}

async function requireAdmin(sock, message, context) {
  if (!await requireGroup(sock, message, context)) return false;
  const state = await getAdminState(sock, context.chatId, senderId(message));
  if (!state.senderIsAdmin) {
    await sendText(sock, context.chatId, 'هذا الأمر للمشرفين فقط.', message);
    return false;
  }
  return state;
}

async function groupInfo(sock, message, _arg, context) {
  if (!await requireGroup(sock, message, context)) return;
  const metadata = await sock.groupMetadata(context.chatId);
  const admins = metadata.participants.filter((person) => person.admin).length;
  await sendText(sock, context.chatId, `╭─「 بيانات المجموعة 」\n│ الاسم: ${metadata.subject}\n│ الأعضاء: ${metadata.participants.length}\n│ المشرفون: ${admins}\n│ الوصف: ${metadata.desc || 'لا يوجد'}\n╰──`, message);
}

async function inviteLink(sock, message, _arg, context) {
  const state = await requireAdmin(sock, message, context);
  if (!state) return;
  if (!state.botIsAdmin) return sendText(sock, context.chatId, 'يجب ترقية البوت إلى مشرف ليتمكن من جلب رابط الدعوة.', message);
  const code = await sock.groupInviteCode(context.chatId);
  await sendText(sock, context.chatId, `🔗 https://chat.whatsapp.com/${code}`, message);
}

async function mentionQuoted(sock, message, _arg, context) {
  if (!await requireAdmin(sock, message, context)) return;
  const quoted = message.message?.extendedTextMessage?.contextInfo;
  const target = quoted?.participant || quoted?.remoteJid;
  if (!target || !target.endsWith('@s.whatsapp.net')) {
    return sendText(sock, context.chatId, `ردّ على رسالة العضو ثم اكتب ${config.prefix}منشن.`, message);
  }
  const number = phoneDigits(target);
  await sock.sendMessage(context.chatId, { text: `✦ تم استدعاء @${number}`, mentions: [target] }, { quoted: message });
}

async function setAnnouncement(sock, message, context, announcement) {
  const state = await requireAdmin(sock, message, context);
  if (!state) return;
  if (!state.botIsAdmin) return sendText(sock, context.chatId, 'يجب أن يكون البوت مشرفًا لتغيير إعدادات المجموعة.', message);
  await sock.groupSettingUpdate(context.chatId, announcement ? 'announcement' : 'not_announcement');
  await sendText(sock, context.chatId, announcement ? '🔒 تم تقييد إرسال الرسائل للمشرفين وفق إعدادات واتساب.' : '🔓 عادت المجموعة إلى إعدادها العادي للرسائل.', message);
}

async function setWelcome(sock, message, argument, context) {
  if (!await requireAdmin(sock, message, context)) return;
  const action = argument.trim().toLowerCase();
  if (!['تشغيل', 'ايقاف', 'إيقاف', 'on', 'off'].includes(action)) {
    return sendText(sock, context.chatId, `الاستخدام: ${config.prefix}ترحيب تشغيل أو ${config.prefix}ترحيب إيقاف`, message);
  }
  const enabled = ['تشغيل', 'on'].includes(action);
  await groupSettings.set(context.chatId, { welcome: enabled });
  await sendText(sock, context.chatId, enabled ? '🌟 تم تشغيل رسائل الترحيب.' : 'تم إيقاف رسائل الترحيب.', message);
}

async function welcomeNewMembers(sock, event) {
  if (event.action !== 'add' || !event.participants?.length) return;
  const settings = await groupSettings.get(event.id);
  if (!settings.welcome) return;
  for (const participant of event.participants.slice(0, 10)) {
    const number = phoneDigits(participant);
    await sock.sendMessage(event.id, {
      text: `╭─「 عضو جديد 」\n│ أهلًا وسهلًا @${number} 🌟\n│ نتمنى لك وقتًا ممتعًا معنا.\n╰──`,
      mentions: [participant],
    });
  }
}

const groupCommands = new Map();
for (const alias of ['معلومات', 'groupinfo']) groupCommands.set(alias, groupInfo);
for (const alias of ['رابط', 'invite']) groupCommands.set(alias, inviteLink);
for (const alias of ['منشن', 'tag']) groupCommands.set(alias, mentionQuoted);
for (const alias of ['قفل', 'lock']) groupCommands.set(alias, (sock, msg, _arg, ctx) => setAnnouncement(sock, msg, ctx, true));
for (const alias of ['فتح', 'unlock']) groupCommands.set(alias, (sock, msg, _arg, ctx) => setAnnouncement(sock, msg, ctx, false));
for (const alias of ['ترحيب', 'welcome']) groupCommands.set(alias, setWelcome);

module.exports = { groupCommands, welcomeNewMembers };
