// MAEKEO LAB Service Worker
// 캐시 없이 항상 최신 버전 제공
const VERSION = 'v2.8.2';

// 자동 skipWaiting 제거 — 사용자가 업데이트를 수락할 때만 활성화
self.addEventListener('install', () => {
  // 대기 상태로 두어 진행 중인 작업이 끊기지 않게 함
});

self.addEventListener('activate', (e) => {
  // 앱 전용 캐시만 삭제 (다른 오리진/캐시는 건드리지 않음)
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('maekeo')).map(k => caches.delete(k)))
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
  // 사용자가 업데이트를 수락하면 그때 활성화
  if (e.data && e.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
