import { jidDecode } from '@whiskeysockets/baileys';
import { digits } from '../config.js';

export async function phoneOf(sock, msg, db) {
  const key = msg?.key || {};
  const direct = digits(key.participantPn || key.senderPn || '');
  if (direct) return cache(db, direct);
  const jid = key.participant || key.remoteJid || '';
  const jidPhone = digits(jidDecode(jid)?.user || '');
  if (jidPhone && !jid.includes('@lid')) return cache(db, jidPhone);
  if (jid.includes('@lid')) {
    try {
      const mapped = await sock.signalRepository?.lidMapping?.getPNForLID?.(jid);
      const phone = digits(typeof mapped === 'string' ? mapped.split('@')[0] : mapped?.jid || mapped?.phoneNumber || '');
      if (phone) return cache(db, phone);
    } catch { /* mapping is unavailable on some Baileys builds */ }
  }
  const chat = key.remoteJid;
  if (chat?.endsWith('@g.us')) {
    try {
      const metadata = await sock.groupMetadata(chat);
      const participant = metadata.participants.find((p) => p.id === jid || p.lid === jid);
      const phone = digits(participant?.phoneNumber || participant?.jid || participant?.id?.split('@')[0] || '');
      if (phone && !participant?.id?.includes('@lid')) return cache(db, phone);
    } catch { /* group metadata may not be available */ }
  }
  return '';
}

function cache(db, phone) {
  if (!phone) return '';
  try { db?.updateUser(phone, (user) => { user.phone = phone; return user; }); } catch { /* identity resolution must not interrupt message handling */ }
  return phone;
}

export function jidForPhone(phone) {
  const value = digits(phone);
  return value ? `${value}@s.whatsapp.net` : null;
}

export function wrapSendMessage(sock, logger = console) {
  if (!sock?.sendMessage || sock.__ulquiorraSendWrapped) return sock;
  const original = sock.sendMessage.bind(sock);
  sock.sendMessage = async (...args) => {
    for (let attempt = 0; ; attempt += 1) {
      try { return await original(...args); }
      catch (error) {
        if (attempt >= 2 || !/media upload failed/i.test(String(error?.message || error))) throw error;
        try { await sock.refreshMediaConn?.(); } catch (refreshError) { logger.warn?.('تعذر تحديث اتصال الوسائط:', refreshError?.message); }
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  };
  Object.defineProperty(sock, '__ulquiorraSendWrapped', { value: true });
  return sock;
}
