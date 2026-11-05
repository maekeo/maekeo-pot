// 매커 소식 알림(웹 푸시) 구독 등록 / 해제
// - 저장하는 것: 브라우저가 발급한 푸시 주소(endpoint)와 암호화 키, 기기 종류뿐 (이름·전화번호 없음)
// - 키: sub/ + endpoint 해시
const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');

const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
// 주요 브라우저 푸시 서버만 허용 (안드로이드 크롬·삼성 인터넷, 아이폰 사파리, 파이어폭스, 엣지)
const OK_HOST = /(^|\.)(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;
const reply = (code, obj) => ({ statusCode: code, headers: H, body: JSON.stringify(obj || {}) });

function keyOf(endpoint) {
  return 'sub/' + crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 40);
}
function validEndpoint(ep) {
  if (typeof ep !== 'string' || ep.length > 1000) return false;
  try { const u = new URL(ep); return u.protocol === 'https:' && OK_HOST.test(u.hostname); } catch (e) { return false; }
}
function deviceOf(ua) {
  ua = String(ua || '');
  return /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : /Mobi/.test(ua) ? 'other' : 'pc';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405);
  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400); }

  connectLambda(event);
  const store = getStore('push');

  if (b.action === 'unsub') {
    if (!validEndpoint(b.endpoint)) return reply(400);
    await store.delete(keyOf(b.endpoint));
    return reply(200, { ok: true });
  }

  const sub = b.sub || {}, keys = sub.keys || {};
  if (!validEndpoint(sub.endpoint)) return reply(400);
  if (typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string' || keys.p256dh.length > 200 || keys.auth.length > 100) return reply(400);

  const k = keyOf(sub.endpoint);
  let prev = null;
  try { prev = await store.get(k, { type: 'json' }); } catch (e) {}
  await store.setJSON(k, {
    sub: { endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
    dv: deviceOf(event.headers['user-agent']),
    admin: !!(prev && prev.admin),          // 관리자 테스트 기기 표시는 통계 페이지에서만 설정
    t: (prev && prev.t) || Date.now(),
  });
  return reply(200, { ok: true });
};
