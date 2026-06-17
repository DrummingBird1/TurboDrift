// sw.js — Service Worker for offline play
const CACHE = 'turbo-drift-v4';
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
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/CopyShader.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/shaders/LuminosityHighPassShader.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/EffectComposer.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/RenderPass.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/ShaderPass.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/MaskPass.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/postprocessing/UnrealBloomPass.js'
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

// Network-first for navigations + same-origin HTML/JS/CSS so code updates land immediately;
// cache-first (stale-while-revalidate) for everything else (fonts, CDN libs, images).
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isDoc = e.request.mode === 'navigate' ||
    (url.origin === self.location.origin && /\.(html|js|css)$/.test(url.pathname));

  if (isDoc) {
    e.respondWith(
      fetch(e.request).then(resp => {
        if (resp && resp.status === 200) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy).catch(() => {}));
        }
        return resp;
      }).catch(() => caches.match(e.request).then(c => c || caches.match('./index.html')))
    );
    return;
  }

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
