// ---------- Service Worker de Verbify (app instalable y uso sin conexión) ----------
// Sube el número de versión cada vez que publiques cambios para que los móviles se actualicen.
const VERSION = 'verbify-v1.3.1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/app.js', 'js/account.js', 'js/config.js', 'js/state.js', 'js/i18n.js', 'js/ui.js', 'js/utils.js',
  'js/backend-supabase.js', 'js/backend-demo.js',
  'js/views/auth.js', 'js/views/home.js', 'js/views/practice.js', 'js/views/study.js',
  'js/views/groups.js', 'js/views/admin.js', 'js/views/settings.js',
  'data/verbos-1eso.csv', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Nunca cachear la base de datos (Supabase)
  if (url.hostname.endsWith('supabase.co') || url.pathname.includes('/rest/') || url.pathname.includes('/auth/')) return;

  const cacheable = url.origin === self.location.origin
    || ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);
  if (!cacheable) return;

  // Red primero (para tener siempre lo último) y, si no hay conexión, la copia guardada
  // Archivos propios: siempre se comprueba con el servidor si hay versión nueva
  const sameOrigin = url.origin === self.location.origin;
  const net = sameOrigin && req.mode !== 'navigate' ? fetch(req.url, { cache: 'no-cache' }) : fetch(req);
  e.respondWith(
    net
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined))),
  );
});
