// sw.js — Service Worker for offline play
const CACHE = 'turbo-drift-v3';
const ASSETS = [
  './',
  './index.html',
  './about.html',
  './css/style.css',
  './assets/logo.svg',
  './manifest.json',
  './js/game.js',
  './js/storage.js',
  './js/auth.js',
  './js/menu.js',
  './js/missions.js',
  './js/achievements.js',
  './js/cars.js',
  './js/shop.js',
  './js/audio.js',
  './js/particles.js',
  './js/world.js',
  './js/physics.js',
  './js/hud.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(err => console.warn('SW cache partial', err)))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(resp => {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy).catch(() => {}));
        }
        return resp;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
