// Service worker : met toute l'app en cache pour un fonctionnement 100 % hors ligne.
// À CHAQUE MISE À JOUR de l'app, change ce numéro (et celui de js/version.js) :
const VERSION = '1.1.0';

const CACHE = 'dj-crate-' + VERSION;
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/store.js',
  'js/version.js',
  'js/core/camelot.js',
  'js/core/compat.js',
  'js/core/setbuilder.js',
  'js/core/model.js',
  'js/core/importers.js',
  'js/core/demo.js',
  'js/data/packs.js',
  'js/ui/state.js',
  'js/ui/util.js',
  'js/ui/sketch.js',
  'js/ui/dragsort.js',
  'js/ui/library.js',
  'js/ui/wheel.js',
  'js/ui/sets.js',
  'js/ui/live.js',
  'js/ui/settings.js',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(FILES.map((f) => fetch(f, { cache: 'reload' }).then((res) => {
        if (!res.ok) throw new Error('Fichier introuvable : ' + f);
        return cache.put(f, res);
      })))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dj-crate-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try { return await fetch(req); }
      catch (e) {
        if (req.mode === 'navigate') { const page = await cache.match('index.html'); if (page) return page; }
        throw e;
      }
    })
  );
});
