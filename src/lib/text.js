function extractText(message) {
  let current = message;
  for (let depth = 0; current && depth < 5; depth++) {
    if (current.conversation) return current.conversation;
    if (current.extendedTextMessage?.text) return current.extendedTextMessage.text;
    if (current.imageMessage?.caption) return current.imageMessage.caption;
    if (current.videoMessage?.caption) return current.videoMessage.caption;
    if (current.documentMessage?.caption) return current.documentMessage.caption;
    if (current.buttonsResponseMessage?.selectedButtonId) return current.buttonsResponseMessage.selectedButtonId;
    if (current.listResponseMessage?.singleSelectReply?.selectedRowId) return current.listResponseMessage.singleSelectReply.selectedRowId;
    if (current.templateButtonReplyMessage?.selectedId) return current.templateButtonReplyMessage.selectedId;
    current = current.ephemeralMessage?.message || current.viewOnceMessage?.message || current.viewOnceMessageV2?.message;
  }
  return '';
}

function senderId(message) {
  return message.key?.participant || message.key?.remoteJid || '';
}

function isGroup(jid = '') {
  return jid.endsWith('@g.us');
}

function phoneDigits(jid = '') {
  return jid.split('@')[0].split(':')[0];
}

async function sendText(sock, jid, text, quoted) {
  const options = quoted ? { quoted } : {};
  return sock.sendMessage(jid, { text }, options);
}

module.exports = { extractText, senderId, isGroup, phoneDigits, sendText };
