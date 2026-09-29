// Offline support and daily reminders.
//
// The service worker (public/sw.js) caches the app and its data so it runs
// with no connection. Reminders have two paths, since there is no push
// server: while the app is open (or in a background tab) a timer fires at
// the chosen time; when installed on a phone, Chromium's periodic
// background sync lets the worker check in about twice a day. Either way a
// reminder only shows if nothing was studied yet that day.
const STATE_CACHE = 'nihongo-state';
const STATE_URL = '/__reminder-state';

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    // Files the page loaded before the worker took control (the app bundle
    // itself, fonts) aren't in its cache yet; hand it the list.
    const ready = await navigator.serviceWorker.ready;
    const urls = performance.getEntriesByType('resource').map(e => e.name).concat(location.href);
    ready.active?.postMessage({ type: 'cache-urls', urls });
    return reg;
  } catch (e) {
    console.error('Service worker registration failed', e);
    return null;
  }
}

// What the worker needs to decide whether to nudge: kept in the Cache API,
// which (unlike localStorage) the worker can read.
export async function saveReminderState(state) {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(STATE_CACHE);
    await cache.put(STATE_URL, new Response(JSON.stringify(state), { headers: { 'Content-Type': 'application/json' } }));
  } catch { /* storage unavailable */ }
}

export async function enableBackgroundCheck() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg?.periodicSync) return false;
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (status.state !== 'granted') return false;
    await reg.periodicSync.register('nihongo-reminder', { minInterval: 12 * 60 * 60 * 1000 });
    return true;
  } catch {
    return false;
  }
}

export async function disableBackgroundCheck() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    await reg?.periodicSync?.unregister('nihongo-reminder');
  } catch { /* nothing registered */ }
}

export async function showReminder({ title, body }) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const options = { body, icon: '/favicon.png', badge: '/favicon.png', tag: 'nihongo-reminder' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(title, options); return; }
  } catch { /* fall through to a page notification */ }
  new Notification(title, options);
}

// ms until the next occurrence of "HH:MM" local time.
export function msUntil(time, now = new Date()) {
  const [h, m] = time.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target - now;
}

export const reminderText = ({ dueCount, streak }) => ({
  title: dueCount > 0 ? `${dueCount} word${dueCount === 1 ? '' : 's'} ready to review` : 'Time for a quick session',
  body: streak > 0
    ? `A few minutes keeps your ${streak}-day streak going.`
    : 'A few minutes a day is all it takes to start a streak.'
});
