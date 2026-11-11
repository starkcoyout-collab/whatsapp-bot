import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';

const SNAPSHOT_INTERVAL = 30 * 60 * 1000;
const SNAPSHOT_LIMIT = 20;
const SAVE_DEBOUNCE = 250;

export function userDefaults(phone = '') {
  return {
    phone: phone || '', name: 'مستخدم', displayName: 'مستخدم', theme: 'emerald',
    reiatsu: 0, bank: 0, debt: 0, xp: 0, level: 1, prestige: 0, streak: 0,
    lastDaily: 0, lastWork: 0, shieldUntil: 0, rank: 10, wins: 0, losses: 0,
    materials: {}, inventory: {}, garden: [], expedition: null, reminders: [],
    warnings: 0, afk: null, banned: false, settings: {}, createdAt: Date.now()
  };
}

const emptyState = () => ({ version: 1, users: {}, groups: {}, settings: { mode: config.mode }, metadata: { createdAt: Date.now() } });

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function atomicWrite(file, value) {
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await fs.open(tmp, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, file);
}

export class Database {
  constructor(file = config.dbFile) {
    this.file = file;
    this.snapshotDir = config.snapshotsDir;
    this.state = emptyState();
    this.timer = null;
    this.snapshotTimer = null;
    this.writeChain = Promise.resolve();
    this.closed = false;
  }

  async init() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.mkdir(this.snapshotDir, { recursive: true });
    try {
      this.state = this.validate(await readJson(this.file));
    } catch (error) {
      if (error?.code !== 'ENOENT') console.error('قاعدة البيانات تالفة؛ محاولة الاستعادة من نسخة احتياطية.');
      this.state = await this.recover();
      await atomicWrite(this.file, this.state);
    }
    this.snapshotTimer = setInterval(() => this.snapshot().catch((e) => console.error('فشل حفظ النسخة:', e.message)), SNAPSHOT_INTERVAL);
    this.snapshotTimer.unref?.();
    return this;
  }

  validate(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('صيغة قاعدة البيانات غير صالحة');
    const base = emptyState();
    return {
      ...base, ...value,
      users: value.users && typeof value.users === 'object' ? value.users : {},
      groups: value.groups && typeof value.groups === 'object' ? value.groups : {},
      settings: { ...base.settings, ...(value.settings || {}) },
      metadata: { ...base.metadata, ...(value.metadata || {}) }
    };
  }

  async recover() {
    const prefix = `${path.basename(this.file)}.`;
    let files = [];
    try { files = await fs.readdir(this.snapshotDir); } catch { return emptyState(); }
    files = files.filter((f) => f.startsWith(prefix) && f.endsWith('.json')).sort().reverse();
    for (const file of files) {
      try { return this.validate(await readJson(path.join(this.snapshotDir, file))); } catch { /* try the preceding snapshot */ }
    }
    return emptyState();
  }

  getUser(phone) {
    const id = String(phone || '');
    const current = this.state.users[id] || {};
    const merged = { ...userDefaults(id), ...current, phone: current.phone || id };
    this.state.users[id] = merged;
    return merged;
  }

  updateUser(phone, updater) {
    const user = this.getUser(phone);
    const result = updater(user) || user;
    this.state.users[String(phone)] = result;
    this.scheduleSave();
    return result;
  }

  getGroup(id) {
    this.state.groups[id] ||= { settings: {}, warnings: {}, welcome: false, antiLink: false };
    return this.state.groups[id];
  }

  setSetting(key, value) {
    this.state.settings[key] = value;
    this.scheduleSave();
  }

  scheduleSave() {
    if (this.closed) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save().catch((e) => console.error('فشل حفظ قاعدة البيانات:', e.message)), SAVE_DEBOUNCE);
    this.timer.unref?.();
  }

  save() {
    clearTimeout(this.timer);
    this.writeChain = this.writeChain.then(() => atomicWrite(this.file, this.state));
    return this.writeChain;
  }

  async snapshot() {
    await this.save();
    const stamp = new Date().toISOString().replaceAll(':', '-');
    const name = `${path.basename(this.file)}.${stamp}.json`;
    await atomicWrite(path.join(this.snapshotDir, name), this.state);
    const files = (await fs.readdir(this.snapshotDir))
      .filter((f) => f.startsWith(`${path.basename(this.file)}.`) && f.endsWith('.json')).sort().reverse();
    await Promise.all(files.slice(SNAPSHOT_LIMIT).map((f) => fs.unlink(path.join(this.snapshotDir, f)).catch(() => {})));
  }

  async close() {
    this.closed = true;
    clearTimeout(this.timer);
    clearInterval(this.snapshotTimer);
    await this.save();
  }
}
