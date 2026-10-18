// 1주년 한정판 매커포트 — 기존 구매자 확인
// - 구매자 이메일 아이디(@ 앞부분)를 HMAC-SHA256(비밀키)로 변환한 값만 buyer-hashes.json에 보관
// - 비밀키는 Netlify 환경변수 BUYER_HASH_KEY 에만 둔다 (저장소에 절대 넣지 않음)
// - 입력값은 로그로 남기지 않는다
const crypto = require('crypto');
const HASHES = new Set(require('./buyer-hashes.json'));

// 한정판 예약 상품 링크 (비어 있으면 '준비 중' 응답)
const LIMITED_URL = 'https://www.maekeo.kr/goods/goods_view.php?goodsNo=1000000053';
// 예약 마감: 2026-10-31 23:59:59 (KST)
const DEADLINE = Date.parse('2026-10-31T23:59:59+09:00');

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

// 인스턴스 단위 간이 횟수 제한: IP당 10분에 10회
const WINDOW_MS = 10 * 60 * 1000;
const MAX_TRIES = 10;
const tries = new Map();

function limited(ip) {
  const now = Date.now();
  const rec = tries.get(ip);
  if (!rec || now - rec.start > WINDOW_MS) {
    tries.set(ip, { start: now, n: 1 });
    return false;
  }
  rec.n += 1;
  return rec.n > MAX_TRIES;
}

function normalize(v) {
  return String(v || '').trim().toLowerCase().split('@')[0].replace(/\s+/g, '');
}

const reply = (obj) => ({ statusCode: 200, headers: HEADERS, body: JSON.stringify(obj) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: '{}' };

  const key = process.env.BUYER_HASH_KEY;
  if (!key || HASHES.size === 0 || !LIMITED_URL) return reply({ ok: false, reason: 'not_ready' });

  if (Date.now() > DEADLINE) return reply({ ok: false, reason: 'closed' });

  const ip = event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || 'unknown';
  if (limited(ip)) return reply({ ok: false, reason: 'too_many' });

  let id = '';
  try { id = normalize(JSON.parse(event.body || '{}').id); } catch (e) { id = ''; }
  if (id.length < 2 || id.length > 64) {
    await sleep(400);
    return reply({ ok: false, reason: 'no_match' });
  }

  const h = crypto.createHmac('sha256', key).update(id).digest('hex');
  if (HASHES.has(h)) return reply({ ok: true, url: LIMITED_URL });

  await sleep(400);
  return reply({ ok: false, reason: 'no_match' });
};
