// 매커랩 통계 조회 (관리자 전용)
// - 요청 헤더 x-stats-pass 가 Netlify 환경변수 STATS_PASSWORD 와 같아야 함
const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');

const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

function same(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
function kstDay(offset) {
  return new Date(Date.now() + 9 * 3600 * 1000 - offset * 86400000).toISOString().slice(0, 10);
}

exports.handler = async (event) => {
  // 앞뒤 공백·줄바꿈이 섞여 등록되는 경우가 있어 양쪽 모두 정리 후 비교
  const pass = (process.env.STATS_PASSWORD || '').normalize('NFC').trim();
  if (!pass) return { statusCode: 503, headers: H, body: JSON.stringify({ error: 'not_configured' }) };
  let given = event.headers['x-stats-pass'] || '';
  try { given = decodeURIComponent(given); } catch (e) {}
  if (!same(given.normalize('NFC').trim(), pass)) {
    await new Promise(r => setTimeout(r, 600));
    return { statusCode: 401, headers: H, body: JSON.stringify({ error: 'unauthorized' }) };
  }

  const days = Math.min(Math.max(parseInt((event.queryStringParameters || {}).days, 10) || 14, 1), 60);
  connectLambda(event);
  const store = getStore('stats');
  const dates = Array.from({ length: days }, (_, i) => kstDay(i)).reverse();

  const lists = await Promise.all(dates.map(day => store.list({ prefix: day + '/' }).then(r => r.blobs.map(b => b.key))));

  const all = { visitors: new Set(), appUsers: new Set(), device: {}, counts: {} };
  const daily = dates.map((day, i) => {
    const v = new Set(), app = new Set();
    let visits = 0;
    for (const key of lists[i]) {
      const [, type, detail, device, mode, aid] = key.split('/');
      if (type === 'visit') {
        visits++; v.add(aid); all.visitors.add(aid);
        if (mode === 'app') { app.add(aid); all.appUsers.add(aid); }
        all.device[device] = all.device[device] || new Set();
        all.device[device].add(aid);
      } else {
        const k = type + ':' + detail;
        all.counts[k] = (all.counts[k] || 0) + 1;
      }
    }
    return { date: day, visitors: v.size, appVisitors: app.size, visits };
  });

  const device = {};
  for (const [k, s] of Object.entries(all.device)) device[k] = s.size;

  return {
    statusCode: 200, headers: H,
    body: JSON.stringify({
      days, from: dates[0], to: dates[dates.length - 1],
      visitors: all.visitors.size, appUsers: all.appUsers.size,
      device, counts: all.counts, daily,
    }),
  };
};
