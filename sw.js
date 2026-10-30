// Offline support: serve the app shell from cache, refresh it in the background.
const CACHE = 'table-reset-v3';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/app.js', 'js/store.js', 'js/ui.js', 'js/nutrition.js', 'js/seed.js',
  'js/views/plan.js', 'js/views/recipes.js', 'js/views/recipeEdit.js', 'js/views/suggested.js',
  'js/views/ingredients.js', 'js/views/progress.js', 'js/views/members.js', 'js/views/settings.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network first so updates show up right away; fall back to the cache when offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Same-site files always check with the server, so a new version shows up on the next open.
  const sameSite = new URL(req.url).origin === self.location.origin;
  e.respondWith(
    fetch(req, sameSite ? { cache: 'no-cache' } : {})
      .then((res) => {
        if (res.ok && (new URL(req.url).origin === self.location.origin || req.url.startsWith('https://fonts.'))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
