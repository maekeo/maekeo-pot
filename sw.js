// MAEKEO LAB Service Worker
// 캐시 없이 항상 최신 버전 제공
const VERSION = 'v1.1.8';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  // 모든 캐시 삭제
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 모든 요청을 캐시 없이 네트워크에서 가져옴
self.addEventListener('fetch', (e) => {
  // API 요청은 그냥 통과
  if (
    e.request.url.includes('netlify/functions') ||
    e.request.url.includes('openai.com') ||
    e.request.url.includes('onrender.com')
  ) return;

  // 나머지는 항상 네트워크 우선 (캐시 저장 안 함)
  e.respondWith(
    fetch(e.request, { cache: 'no-store' }).catch(() => new Response('오프라인 상태입니다', { status: 503 }))
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.action === 'GET_VERSION') {
    e.source.postMessage({ type: 'SW_VERSION', version: VERSION });
  }
});
