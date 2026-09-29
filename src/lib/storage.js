// Failure-tolerant wrappers over localStorage (private windows and full
// quotas throw), plus the local-date helpers every schedule and streak uses.
// Every key this app owns starts with "flashcards_"; backups export them all
// except the ones in PRIVATE_KEYS.
export const STORAGE_PREFIX = 'flashcards_';
export const PRIVATE_KEYS = new Set(['flashcards_ai_key']);

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error(`Failed to save ${key}`, e);
    return false;
  }
}

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

// "2026-09-29" in the learner's own time zone, so a day ends at their midnight.
export function dayKey(time = Date.now()) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function endOfDay(time = Date.now()) {
  const d = new Date(time);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function startOfDay(time = Date.now()) {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// The day key `offset` calendar days from `time` (DST-safe: steps by date,
// not by 24-hour blocks).
export function shiftDay(time, offset) {
  const d = new Date(time);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.getTime();
}
