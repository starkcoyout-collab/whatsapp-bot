function phoneDigits(jid = '') {
  return jid.split('@')[0].split(':')[0];
}

async function getAdminState(sock, groupId, senderJid) {
  const metadata = await sock.groupMetadata(groupId);
  const sender = phoneDigits(senderJid || '');
  const bot = phoneDigits(sock.user?.id || '');
  const isAdmin = (participant) => participant.admin === 'admin' || participant.admin === 'superadmin';
  return {
    senderIsAdmin: metadata.participants.some((participant) => phoneDigits(participant.id) === sender && isAdmin(participant)),
    botIsAdmin: metadata.participants.some((participant) => phoneDigits(participant.id) === bot && isAdmin(participant)),
  };
}

module.exports = { getAdminState };
