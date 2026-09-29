// Nihongo Flashcards service worker: offline caching and daily reminders.
// See src/lib/reminders.js for the page side.
//
// Caching strategy:
//   page navigations        network first, cached app shell when offline
//   /assets/* (hashed)      cache first: a changed file gets a new name
//   data, images, fonts     stale-while-revalidate: instant, refreshed behind
const CACHE = 'nihongo-v2';
const STATE_CACHE = 'nihongo-state';
const STATE_URL = '/__reminder-state';
const SHELL = ['/', '/dataset.json', '/kanji-radical-map.json', '/site.webmanifest', '/favicon.png', '/Gradient.png'];
// Module scripts are requested with an Origin header while the copies cached
// at startup weren't, and the server varies on it: match on the URL alone.
const MATCH = { ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE && k !== STATE_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const cacheable = (url) => url.origin === self.location.origin || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'cache-urls') return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const raw of event.data.urls || []) {
      try {
        const url = new URL(raw);
        if (!cacheable(url) || url.pathname.startsWith('/@') || url.pathname.startsWith('/src/') || url.pathname.includes('node_modules')) continue;
        if (await cache.match(url.href, MATCH)) continue;
        const res = await fetch(url.href, { mode: url.origin === self.location.origin ? 'same-origin' : 'cors' });
        if (res.ok) await cache.put(url.href, res);
      } catch { /* skip anything that won't fetch */ }
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!cacheable(url) || url.pathname === STATE_URL) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put('/', res.clone());
        return res;
      } catch {
        return (await caches.match('/', MATCH)) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(request, MATCH);
      if (cached) return cached;
      const res = await fetch(request);
      if (res.ok) (await caches.open(CACHE)).put(request, res.clone());
      return res;
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, MATCH);
    const network = fetch(request)
      .then(res => { if (res.ok) cache.put(request, res.clone()); return res; })
      .catch(() => null);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    return (await network) || Response.error();
  })());
});

// ---------- Reminders ----------
async function readState() {
  try {
    const res = await (await caches.open(STATE_CACHE)).match(STATE_URL);
    return res ? await res.json() : null;
  } catch {
    return null;
  }
}

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function maybeRemind() {
  const state = await readState();
  if (!state?.enabled) return;
  const today = todayKey();
  if (state.lastStudyDay === today || state.lastNotifiedDay === today) return;
  const [h, m] = (state.time || '19:00').split(':').map(Number);
  const now = new Date();
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
  await self.registration.showNotification(state.title || 'Time for a quick session', {
    body: state.body || 'A few minutes a day keeps new words fresh.',
    icon: '/favicon.png',
    badge: '/favicon.png',
    tag: 'nihongo-reminder'
  });
  const cache = await caches.open(STATE_CACHE);
  await cache.put(STATE_URL, new Response(JSON.stringify({ ...state, lastNotifiedDay: today }), { headers: { 'Content-Type': 'application/json' } }));
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'nihongo-reminder') event.waitUntil(maybeRemind());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find(w => new URL(w.url).origin === self.location.origin);
    if (open) return open.focus();
    return self.clients.openWindow('/');
  })());
});
