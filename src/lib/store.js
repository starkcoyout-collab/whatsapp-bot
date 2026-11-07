const fs = require('node:fs/promises');
const path = require('node:path');

const file = path.join(process.cwd(), 'data', 'group-settings.json');
let cache;
let pendingWrite = Promise.resolve();

async function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    cache = {};
  }
  return cache;
}

const groupSettings = {
  async get(jid) {
    const data = await load();
    return data[jid] || {};
  },
  async set(jid, patch) {
    const data = await load();
    data[jid] = { ...data[jid], ...patch };
    pendingWrite = pendingWrite.then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temporary = `${file}.tmp`;
      await fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
      await fs.rename(temporary, file);
    });
    return pendingWrite;
  },
};

module.exports = { groupSettings };
