// MAEKEO LAB Service Worker
// 버전 번호를 올리면 사용자에게 업데이트 알림이 표시됩니다
const VERSION = 'v1.0.9';
const CACHE_NAME = `maekeo-lab-${VERSION}`;

const ASSETS = [
  '/',
  '/index.html',
];

// 설치 — 새 버전 캐시
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  // 즉시 활성화 (waiting 스킵)
  self.skipWaiting();
});

// 활성화 — 이전 버전 캐시 삭제
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// 네트워크 우선 — 항상 최신 버전 제공
self.addEventListener('fetch', (e) => {
  // version.json은 항상 네트워크에서 가져옴 (캐시 사용 안 함)
  if (e.request.url.includes('version.json')) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request))
    );
    return;
  }

  // API 요청은 캐시 없이 통과
  if (e.request.url.includes('/api/') ||
      e.request.url.includes('netlify/functions') ||
      e.request.url.includes('openai.com') ||
      e.request.url.includes('onrender.com')) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// 새 버전 감지 시 클라이언트에 알림
self.addEventListener('message', (e) => {
  if (e.data === 'CHECK_UPDATE') {
    self.clients.matchAll().then(clients => {
      clients.forEach(client => client.postMessage({ type: 'VERSION', version: VERSION }));
    });
  }
  if (e.data && e.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
