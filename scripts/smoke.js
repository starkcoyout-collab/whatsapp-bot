import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const required = ['index.js', 'src/config.js', 'src/db.js', 'src/kernel.js', 'src/lib/wa.js', 'src/boot.js'];
for (const name of required) {
  const file = path.resolve(root, name);
  if (!fs.existsSync(file)) throw new Error(`ملف أساسي مفقود: ${name}`);
  await import(pathToFileURL(file).href);
}
console.log('نجح فحص استيراد ملفات المرحلة الأولى.');
