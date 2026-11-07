const timestamps = new Map();

function take(key, cooldownMs) {
  const now = Date.now();
  const previous = timestamps.get(key) || 0;
  if (now - previous < cooldownMs) return false;
  timestamps.set(key, now);
  if (timestamps.size > 2000) {
    for (const [entry, timestamp] of timestamps) {
      if (now - timestamp > cooldownMs * 10) timestamps.delete(entry);
    }
  }
  return true;
}

module.exports = { take };
