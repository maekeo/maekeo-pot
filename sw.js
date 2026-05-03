// MAEKEO LAB Service Worker
const VERSION = 'v1.1.1';
const CACHE_NAME = `maekeo-lab-${VERSION}`;

const ASSETS = ['/', '/index.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
  notifyClients();
});

self.addEventListener('fetch', (e) => {
  if (
    e.request.url.includes('netlify/functions') ||
    e.request.url.includes('openai.com') ||
    e.request.url.includes('onrender.com')
  ) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

function notifyClients() {
  self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
    clients.forEach(client => {
      client.postMessage({ type: 'SW_VERSION', version: VERSION });
    });
  });
}

self.addEventListener('message', (e) => {
  if (e.data && e.data.action === 'GET_VERSION') {
    e.source.postMessage({ type: 'SW_VERSION', version: VERSION });
  }
  if (e.data && e.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
