// Service worker: makes the POS open and run with no internet.
const V = 'gpos-v7';
const FILES = ['./', 'index.html', 'styles.css', 'core.js', 'ui.js', 'views.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())) });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())) });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/rest/') || u.pathname === '/__gpos') return; // cloud sync calls go straight to the network
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(V).then(c => c.put(e.request, copy)); return r })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
