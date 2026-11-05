// 매커 소식 알림 보내기 (관리자 전용 · 통계 비밀번호 필요)
// - Netlify 환경변수: VAPID_PRIVATE_KEY (필수), VAPID_SUBJECT (선택, 기본 mailto:maeilcoffees@gmail.com)
// - action: count | adminSub | send(test=true면 관리자 테스트 기기만) | logs
const crypto = require('crypto');
const webpush = require('web-push');
const { getStore, connectLambda } = require('@netlify/blobs');

const VAPID_PUBLIC = 'BNb5Gds8YFALY-HudPEnYvD6NBHWIqNFhlK8FhNEkJ__SqBAyOCdV5RxwiLDnfGFU4_EfrUbo9DZbXPna-mg7B0';
const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (code, obj) => ({ statusCode: code, headers: H, body: JSON.stringify(obj || {}) });

// 통계 페이지와 같은 비밀번호 규칙 (한글 자판 입력 허용, 공백·대소문자 무시)
const KEY = { 'ㄱ':'r','ㄲ':'r','ㄴ':'s','ㄷ':'e','ㄸ':'e','ㄹ':'f','ㅁ':'a','ㅂ':'q','ㅃ':'q','ㅅ':'t','ㅆ':'t','ㅇ':'d','ㅈ':'w','ㅉ':'w','ㅊ':'c','ㅋ':'z','ㅌ':'x','ㅍ':'v','ㅎ':'g',
  'ㅏ':'k','ㅐ':'o','ㅑ':'i','ㅒ':'o','ㅓ':'j','ㅔ':'p','ㅕ':'u','ㅖ':'p','ㅗ':'h','ㅘ':'hk','ㅙ':'ho','ㅚ':'hl','ㅛ':'y','ㅜ':'n','ㅝ':'nj','ㅞ':'np','ㅟ':'nl','ㅠ':'b','ㅡ':'m','ㅢ':'ml','ㅣ':'l',
  'ㄳ':'rt','ㄵ':'sw','ㄶ':'sg','ㄺ':'fr','ㄻ':'fa','ㄼ':'fq','ㄽ':'ft','ㄾ':'fx','ㄿ':'fv','ㅀ':'fg','ㅄ':'qt' };
const L = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const V = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const T = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
function toKeys(str) {
  let out = '';
  for (const ch of String(str).normalize('NFC')) {
    const c = ch.charCodeAt(0);
    if (c >= 0xAC00 && c <= 0xD7A3) {
      const n = c - 0xAC00;
      out += KEY[L[Math.floor(n / 588)]] + KEY[V[Math.floor((n % 588) / 28)]] + (T[n % 28] ? KEY[T[n % 28]] : '');
    } else out += KEY[ch] || ch;
  }
  return out.replace(/\s+/g, '').toLowerCase();
}
function same(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
const OK_HOST = /(^|\.)(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/;
function validEndpoint(ep) {
  if (typeof ep !== 'string' || ep.length > 1000) return false;
  try { const u = new URL(ep); return u.protocol === 'https:' && OK_HOST.test(u.hostname); } catch (e) { return false; }
}
function keyOf(endpoint) {
  return 'sub/' + crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 40);
}
// 링크: 매커랩 안의 경로(/...) 또는 매커 관련 https 주소만
function safeUrl(u) {
  u = String(u || '').trim();
  if (!u) return '/';
  if (/^\/(?!\/)/.test(u)) return u.slice(0, 300);
  try {
    const x = new URL(u);
    if (x.protocol === 'https:' && /(^|\.)(maekeo\.kr|maekeo-pot\.netlify\.app|smartstore\.naver\.com|youtube\.com|youtu\.be)$/.test(x.hostname)) return x.href.slice(0, 300);
  } catch (e) {}
  return null;
}
async function allSubs(store) {
  const keys = (await store.list({ prefix: 'sub/' })).blobs.map(b => b.key);
  const out = [];
  for (let i = 0; i < keys.length; i += 25) {
    const part = await Promise.all(keys.slice(i, i + 25).map(k => store.get(k, { type: 'json' }).then(v => v && { k, ...v }).catch(() => null)));
    out.push(...part.filter(Boolean));
  }
  return out;
}

exports.handler = async (event) => {
  const pass = toKeys(process.env.STATS_PASSWORD || '');
  if (!pass) return reply(503, { error: 'not_configured' });
  let given = event.headers['x-stats-pass'] || '';
  try { given = decodeURIComponent(given); } catch (e) {}
  if (!same(toKeys(given), pass)) {
    await new Promise(r => setTimeout(r, 600));
    return reply(401, { error: 'unauthorized' });
  }
  if (event.httpMethod !== 'POST') return reply(405);
  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400); }

  connectLambda(event);
  const store = getStore('push');

  if (b.action === 'count') {
    const subs = await allSubs(store);
    const dv = {};
    subs.forEach(s => { dv[s.dv || 'other'] = (dv[s.dv || 'other'] || 0) + 1; });
    return reply(200, { total: subs.length, admin: subs.filter(s => s.admin).length, dv, ready: !!process.env.VAPID_PRIVATE_KEY });
  }

  if (b.action === 'logs') {
    const keys = (await store.list({ prefix: 'log/' })).blobs.map(x => x.key).sort().reverse().slice(0, 15);
    const logs = (await Promise.all(keys.map(k => store.get(k, { type: 'json' }).catch(() => null)))).filter(Boolean);
    return reply(200, { logs });
  }

  // 이 기기를 관리자 테스트 기기로 등록
  if (b.action === 'adminSub') {
    const sub = b.sub || {}, keys = sub.keys || {};
    if (!validEndpoint(sub.endpoint) || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return reply(400);
    await store.setJSON(keyOf(sub.endpoint), { sub: { endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, dv: 'admin', admin: true, t: Date.now() });
    return reply(200, { ok: true });
  }

  if (b.action === 'send') {
    if (!process.env.VAPID_PRIVATE_KEY) return reply(503, { error: 'no_vapid' });
    const title = String(b.title || '').trim().slice(0, 60);
    const body = String(b.body || '').trim().slice(0, 200);
    const url = safeUrl(b.url);
    if (!title || !body) return reply(400, { error: 'empty' });
    if (url === null) return reply(400, { error: 'url' });
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:maeilcoffees@gmail.com', VAPID_PUBLIC, process.env.VAPID_PRIVATE_KEY);

    const subs = (await allSubs(store)).filter(s => b.test ? s.admin : true);
    const payload = JSON.stringify({ title, body, url, tag: 'maekeo-' + Date.now() });
    let sent = 0, failed = 0, removed = 0;
    for (let i = 0; i < subs.length; i += 25) {
      await Promise.all(subs.slice(i, i + 25).map(async s => {
        try {
          await webpush.sendNotification(s.sub, payload, { TTL: 3 * 86400, urgency: 'normal' });
          sent++;
        } catch (e) {
          failed++;
          // 알림을 끄거나 앱을 지운 기기는 목록에서 정리
          if (e && (e.statusCode === 404 || e.statusCode === 410)) { removed++; await store.delete(s.k).catch(() => {}); }
        }
      }));
    }
    if (!b.test) await store.setJSON('log/' + Date.now(), { title, body, url, sent, failed, at: Date.now() });
    return reply(200, { sent, failed, removed, total: subs.length });
  }

  return reply(400);
};
