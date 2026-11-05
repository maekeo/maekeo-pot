// MAEKEO LAB Service Worker
// 캐시 없이 항상 최신 버전 제공
const VERSION = 'v3.2.64';

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

// ═══ 매커 소식 알림 (웹 푸시) ═══
// 아이폰은 푸시를 받을 때마다 반드시 알림을 띄워야 함 (안 띄우면 구독이 취소될 수 있음)
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || '매커랩';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || 'maekeo',
    data: { url: d.url || '/' },
  }));
});

// 알림을 누르면 매커랩(또는 지정 링크)을 열고, 유입 경로를 'push'로 기록
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  let url;
  try { url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin); } catch (_) { url = new URL('/', self.location.origin); }
  const mine = url.origin === self.location.origin;
  if (mine) url.searchParams.set('s', 'push');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    if (mine) {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) {
          return c.focus().then((w) => (w && 'navigate' in w ? w.navigate(url.href) : null)).catch(() => self.clients.openWindow(url.href));
        }
      }
    }
    return self.clients.openWindow(url.href);
  }));
});
