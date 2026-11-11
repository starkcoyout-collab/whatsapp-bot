import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { digits, config } from './config.js';
import { phoneOf, jidForPhone } from './lib/wa.js';

const friendlyError = 'تعذر تنفيذ الأمر الآن. حاول مجددًا بعد قليل.';

export class Kernel {
  constructor({ sock, db, runtimeConfig = config, logger = console }) {
    this.sock = sock;
    this.db = db;
    this.config = runtimeConfig;
    this.logger = logger;
    this.modules = new Map();
    this.commands = new Map();
    this.cooldowns = new Map();
    this.running = new Set();
    this.seen = new Map();
    this.quarantine = new Map();
  }

  setSocket(sock) { this.sock = sock; }

  async loadModules() {
    await fs.mkdir(this.config.modulesDir, { recursive: true });
    const names = (await fs.readdir(this.config.modulesDir)).filter((n) => n.endsWith('.js')).sort();
    const loaded = new Map();
    const namesToFiles = new Map();
    for (const name of names) {
      const file = path.join(this.config.modulesDir, name);
      try {
        const mod = await import(`${pathToFileURL(file).href}?v=${Date.now()}-${randomUUID()}`);
        const section = mod.default || mod;
        if (!section?.section || !section?.commands || typeof section.commands !== 'object') throw new Error('بنية الوحدة غير صالحة');
        loaded.set(name, section);
        for (const [commandName, command] of Object.entries(section.commands)) {
          if (namesToFiles.has(commandName)) throw new Error(`اسم أمر مكرر: ${commandName}`);
          namesToFiles.set(commandName, name);
          for (const alias of command.alias || []) {
            if (namesToFiles.has(alias)) throw new Error(`اسم مستعار مكرر: ${alias}`);
            namesToFiles.set(alias, name);
          }
        }
      } catch (error) {
        this.quarantine.set(name, error.message);
        this.logger.error?.(`وحدة معزولة ${name}: ${error.message}`);
      }
    }
    this.modules = loaded;
    this.commands.clear();
    for (const [file, section] of loaded) {
      for (const [name, command] of Object.entries(section.commands)) {
        this.commands.set(name, { ...command, name, section, file });
        for (const alias of command.alias || []) this.commands.set(alias, { ...command, name, section, file, aliasOf: name });
      }
    }
    return { modules: loaded.size, commands: [...this.commands.values()].filter((c) => !c.aliasOf).length, quarantined: this.quarantine.size };
  }

  attach() {
    this.sock.ev.on('messages.upsert', async ({ messages = [] }) => {
      for (const msg of messages) {
        try { await this.handleMessage(msg); } catch (error) { this.logger.error?.('فشل معالج الرسالة:', error); }
      }
    });
  }

  async handleMessage(msg) {
    if (!msg?.message || msg.key?.fromMe || msg.messageStubType) return;
    const chat = msg.key.remoteJid;
    const userPhone = await phoneOf(this.sock, msg, this.db);
    if (!userPhone || this.db.getUser(userPhone).banned) return;
    const text = extractText(msg).trim();
    if (!text.startsWith(this.config.prefix)) return;
    const id = msg.key.id || `${chat}:${userPhone}:${text}`;
    const now = Date.now();
    this.pruneSeen(now);
    if (this.seen.has(id)) return;
    this.seen.set(id, now);
    const [typedName, ...parts] = text.slice(this.config.prefix.length).trim().split(/\s+/u);
    if (!typedName) return;
    if (typedName === 'reload' || typedName === 'إعادةتحميل') {
      if (this.isOwner(userPhone)) {
        const result = await this.loadModules();
        await this.send(chat, `اكتمل تحديث الوحدات: ${result.modules} قسم، ${result.commands} أمر. الوحدات المعزولة: ${result.quarantined}.`);
      }
      return;
    }
    const command = this.commands.get(typedName);
    if (!command || command.hide) return;
    if (this.config.mode !== 'public' && !this.isOwner(userPhone)) return;
    if (command.owner && !this.isOwner(userPhone)) return this.send(chat, 'هذا الأمر مخصص لمالك البوت.');
    if (command.group && !chat?.endsWith('@g.us')) return this.send(chat, 'هذا الأمر يعمل داخل المجموعات فقط.');
    const admin = command.admin ? await this.isAdmin(chat, userPhone) : false;
    if (command.admin && !admin) return this.send(chat, 'هذا الأمر متاح لمشرفي المجموعة فقط.');
    if (command.botAdmin && !(await this.isBotAdmin(chat))) return this.send(chat, 'يجب ترقية البوت إلى مشرف أولًا.');
    const key = `${userPhone}:${command.name}`;
    const cooldown = Number(command.cool) || 0;
    const last = this.cooldowns.get(key) || 0;
    if (now - last < cooldown) return this.send(chat, `انتظر ${Math.ceil((cooldown - (now - last)) / 1000)} ثانية قبل تكرار الأمر.`);
    if (this.running.has(userPhone)) return this.send(chat, 'لديك أمر آخر قيد التنفيذ، انتظر لحظة.');
    this.cooldowns.set(key, now);
    this.running.add(userPhone);
    try {
      const ctx = await this.makeContext(msg, userPhone, command, parts.join(' '));
      if (command.needTarget && !ctx.targetPhone) return this.send(chat, 'اذكر عضوًا أو رد على رسالته أو اكتب رقمه الدولي.');
      await command.run(ctx);
    } catch (error) {
      this.logger.error?.(`تعطل الأمر ${command.name}:`, error);
      await this.send(chat, friendlyError);
    } finally {
      this.running.delete(userPhone);
    }
  }

  async makeContext(msg, phone, command, args) {
    const chat = msg.key.remoteJid;
    const targetPhone = await resolveTarget(this.sock, msg, args, this.db);
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const ctx = {
      sock: this.sock, db: this.db, config: this.config, msg, chat, phone, command, args,
      say: (content, options = {}) => this.send(chat, content, options),
      react: async (emoji) => this.sock.sendMessage(chat, { react: { text: emoji, key: msg.key } }),
      pic: async (image, caption = '') => this.send(chat, { image, caption }),
      file: async (document, fileName, mimetype = 'application/octet-stream') => this.send(chat, { document, fileName, mimetype }),
      quotedText: extractQuotedText(msg),
      target: async () => targetPhone,
      targetPhone,
      media: async (kinds = []) => {
        const type = mediaType(msg);
        if (kinds.length && !kinds.includes(type)) return null;
        try { return await downloadMediaMessage(msg, 'buffer', {}, { logger: this.logger }); } catch { return null; }
      },
      isAdmin: () => this.isAdmin(chat, phone),
      isBotAdmin: () => this.isBotAdmin(chat),
      who: () => ({ name: cleanName(msg.pushName || this.db.getUser(phone).displayName), phone: this.db.getUser(phone).phone || 'الرقم مخفي' }),
      isOwner: this.isOwner(phone),
      quoted
    };
    return ctx;
  }

  async isAdmin(chat, phone) {
    if (!chat?.endsWith('@g.us')) return false;
    try {
      const meta = await this.sock.groupMetadata(chat);
      return meta.participants.some((p) => jidPhone(p.id, p.phoneNumber) === phone && ['admin', 'superadmin'].includes(p.admin));
    } catch { return false; }
  }

  async isBotAdmin(chat) {
    if (!chat?.endsWith('@g.us')) return false;
    try {
      const meta = await this.sock.groupMetadata(chat);
      const self = this.sock.user?.id;
      return meta.participants.some((p) => p.id === self && ['admin', 'superadmin'].includes(p.admin));
    } catch { return false; }
  }

  isOwner(phone) {
    const saved = this.db?.state?.settings?.ownerNumber || '';
    return Boolean(phone && (phone === this.config.ownerNumber || phone === saved));
  }

  async send(chat, content, options = {}) {
    return this.sock.sendMessage(chat, typeof content === 'string' ? { text: content, ...options } : content, { ...options });
  }

  pruneSeen(now) {
    const ttl = this.config.limits.commandDedupeMs;
    for (const [id, at] of this.seen) if (now - at > ttl) this.seen.delete(id);
  }
}

export function extractText(msg) {
  const m = msg?.message || {};
  return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || m.documentMessage?.caption || '';
}

export function extractQuotedText(msg) {
  const q = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  return q?.conversation || q?.extendedTextMessage?.text || q?.imageMessage?.caption || q?.videoMessage?.caption || '';
}

function mediaType(msg) {
  const m = msg.message || {};
  for (const [key, type] of [['imageMessage', 'image'], ['videoMessage', 'video'], ['audioMessage', 'audio'], ['stickerMessage', 'sticker'], ['documentMessage', 'document']]) if (m[key]) return type;
  return 'text';
}

function cleanName(value) {
  return String(value || 'مستخدم').normalize('NFKC').replace(/[\u0000-\u001f]/g, '').slice(0, 80) || 'مستخدم';
}

function jidPhone(jid, pn) {
  return digits(pn || String(jid || '').split('@')[0].split(':')[0]);
}

async function resolveTarget(sock, msg, args, db) {
  const context = msg.message?.extendedTextMessage?.contextInfo || {};
  const mentioned = context.mentionedJid?.[0] || context.participant;
  const raw = String(args || '').match(/(?:\+?\d[\d\s-]{5,}\d)/)?.[0];
  const candidate = mentioned || (raw ? `${digits(raw)}@s.whatsapp.net` : null);
  if (!candidate) return null;
  const phone = await phoneOf(sock, { key: { remoteJid: msg.key.remoteJid, participant: candidate, participantPn: context.participantPn, senderPn: context.senderPn } }, db);
  return phone || null;
}
