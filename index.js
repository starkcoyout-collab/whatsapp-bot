import { startBot } from './src/boot.js';

startBot().catch((error) => {
  console.error('تعذر تشغيل بوت الكيورا:', error?.stack || error);
  process.exitCode = 1;
});
