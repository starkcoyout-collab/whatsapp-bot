const config = require('../config');
const { generalCommands } = require('./general');
const { groupCommands } = require('./groups');
const { sendText } = require('../lib/text');

const commands = new Map([...generalCommands, ...groupCommands]);

async function dispatchCommand(sock, message, body, context) {
  if (!body) return;
  const [name, ...args] = body.split(/\s+/);
  const command = name.toLocaleLowerCase('ar');
  const handler = commands.get(command);
  if (!handler) {
    if (command) await sendText(sock, context.chatId, `الأمر «${name}» غير موجود. اكتب ${config.prefix}مساعدة.`, message);
    return;
  }
  await handler(sock, message, args.join(' '), context);
}

module.exports = { dispatchCommand, commands };
