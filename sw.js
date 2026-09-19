const CACHE = 'jarvis-v1';
const SHELL = ['./', 'index.html', 'manifest.json', 'icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'jarvis-cfg').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first for our own files so updates show up, cache as offline fallback.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./')))
  );
});

// The app sends the server address and token here so pushes can fetch their message.
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'cfg') {
    e.waitUntil(
      caches.open('jarvis-cfg').then((c) => c.put('cfg', new Response(JSON.stringify({ url: d.url, token: d.token }))))
    );
  }
});

async function readCfg() {
  const c = await caches.open('jarvis-cfg');
  const r = await c.match('cfg');
  return r ? r.json() : null;
}

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let items = [];
    try {
      const cfg = await readCfg();
      if (cfg && cfg.url) {
        const r = await fetch(cfg.url.replace(/\/$/, '') + '/pending', {
          headers: { authorization: 'Bearer ' + cfg.token },
        });
        if (r.ok) items = (await r.json()).items || [];
      }
    } catch (err) { /* fall through to the generic message */ }
    if (!items.length) items = [{ text: 'You have a reminder, Sir.' }];
    for (const it of items) {
      await self.registration.showNotification('Jarvis', {
        body: it.text,
        icon: 'icon.svg',
        badge: 'icon.svg',
        tag: it.id || undefined,
        vibrate: [200, 100, 200],
      });
    }
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) =>
      list.length ? list[0].focus() : clients.openWindow('./')
    )
  );
});
