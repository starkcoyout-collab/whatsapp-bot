const config = require('../config');
const { take } = require('../lib/rate-limit');
const { extractText, senderId, isGroup } = require('../lib/text');
const { handleMenuReply } = require('../lib/menu');
const { dispatchCommand } = require('../commands');

async function handleMessage(sock, message, baileys) {
  if (!message?.message || message.key?.fromMe) return;
  const jid = message.key?.remoteJid;
  if (!jid || jid === 'status@broadcast' || baileys.isJidNewsletter?.(jid)) return;

  const text = extractText(message.message).trim();
  if (!text || text.length > config.maxTextLength) return;
  if (await handleMenuReply(sock, message, text)) return;
  if (!text.startsWith(config.prefix)) return;

  const sender = senderId(message);
  const bucketKey = `${jid}:${sender}`;
  if (!take(bucketKey, config.commandCooldownMs)) return;

  await dispatchCommand(sock, message, text.slice(config.prefix.length).trim(), {
    baileys,
    chatId: jid,
    sender,
    group: isGroup(jid),
  });
}

module.exports = { handleMessage };
