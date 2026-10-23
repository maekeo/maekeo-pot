// 매커랩 통계 조회 (관리자 전용)
// - 요청 헤더 x-stats-pass 가 Netlify 환경변수 STATS_PASSWORD 와 같아야 함
const crypto = require('crypto');
const { getStore, connectLambda } = require('@netlify/blobs');

// 한글 자판(두벌식) 상태로 입력된 글자를 실제 누른 영문 키로 되돌림
// 예: 'ㅡ먀ㄷ' 같은 입력도 영문 키 입력과 같은 것으로 비교
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
  // 공백 제거, 대소문자 무시, 한글 자판으로 입력된 값도 같은 키로 인정
  const pass = toKeys(process.env.STATS_PASSWORD || '');
  if (!pass) return { statusCode: 503, headers: H, body: JSON.stringify({ error: 'not_configured' }) };
  let given = event.headers['x-stats-pass'] || '';
  try { given = decodeURIComponent(given); } catch (e) {}
  if (!same(toKeys(given), pass)) {
    await new Promise(r => setTimeout(r, 600));
    return { statusCode: 401, headers: H, body: JSON.stringify({ error: 'unauthorized' }) };
  }

  connectLambda(event);
  const store = getStore('stats');

  // 전용 유입 링크 만들기 / 삭제
  if (event.httpMethod === 'POST') {
    let b = {};
    try { b = JSON.parse(event.body || '{}'); } catch (e) {}
    if (b.action === 'createLink') {
      const label = String(b.label || '').trim().slice(0, 40);
      const type = String(b.type || '기타').trim().slice(0, 12);
      if (!label) return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'label' }) };
      const code = crypto.randomBytes(4).toString('hex').slice(0, 6);
      await store.setJSON('links/' + code, { label, type, created: kstDay(0) });
      return { statusCode: 200, headers: H, body: JSON.stringify({ code }) };
    }
    if (b.action === 'deleteLink' && /^[a-z0-9]{3,12}$/.test(String(b.code || ''))) {
      await store.delete('links/' + b.code);
      return { statusCode: 200, headers: H, body: '{}' };
    }
    return { statusCode: 400, headers: H, body: '{}' };
  }

  const days = Math.min(Math.max(parseInt((event.queryStringParameters || {}).days, 10) || 14, 1), 60);
  const dates = Array.from({ length: days }, (_, i) => kstDay(i)).reverse();

  const lists = await Promise.all(dates.map(day => store.list({ prefix: day + '/' }).then(r => r.blobs.map(b => b.key))));

  const all = { visitors: new Set(), appUsers: new Set(), device: {}, counts: {}, source: {}, brews: [], gsets: [] };
  const daily = dates.map((day, i) => {
    const v = new Set(), app = new Set();
    let visits = 0;
    for (const key of lists[i]) {
      const [, type, detail, device, mode, aid] = key.split('/');
      if (type === 'brew' || type === 'gset') { (type === 'brew' ? all.brews : all.gsets).push(detail); continue; }
      if (type === 'visit') {
        visits++; v.add(aid); all.visitors.add(aid);
        if (mode === 'app') { app.add(aid); all.appUsers.add(aid); }
        all.device[device] = all.device[device] || new Set();
        all.device[device].add(aid);
        all.source[detail] = all.source[detail] || new Set();
        all.source[detail].add(aid);
      } else {
        const k = type + ':' + detail;
        all.counts[k] = (all.counts[k] || 0) + 1;
      }
    }
    return { date: day, visitors: v.size, appVisitors: app.size, visits };
  });

  const device = {};
  for (const [k, s] of Object.entries(all.device)) device[k] = s.size;
  const source = {};
  for (const [k, s] of Object.entries(all.source)) source[k] = s.size;

  // 그라인더별 매커포트 설정 집계
  const median = arr => { const a = arr.slice().sort((x, y) => x - y); const n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; };
  const gb = {};
  for (const d of all.brews) {
    const [g, setting, cups, sec, rate] = d.split('_');
    const k = g + '_' + cups;
    const o = gb[k] = gb[k] || { grinder: g, cups: +cups, n: 0, good: 0, settings: {}, goodSecs: [] };
    o.n++;
    if (rate === 'g') { o.good++; o.settings[setting] = (o.settings[setting] || 0) + 1; o.goodSecs.push(+sec); }
  }
  const grinders = Object.values(gb).map(o => ({
    grinder: o.grinder, cups: o.cups, n: o.n, good: o.good,
    topSettings: Object.entries(o.settings).sort((a, b) => b[1] - a[1]).slice(0, 3),
    goodMedianSec: median(o.goodSecs),
  })).sort((a, b) => b.n - a.n);
  const gs = {};
  for (const d of all.gsets) {
    const [g, setting, um] = d.split('_');
    const k = g + '_' + setting;
    (gs[k] = gs[k] || { grinder: g, setting, ums: [] }).ums.push(+um);
  }
  const grindMeasure = Object.values(gs).map(o => ({ grinder: o.grinder, setting: o.setting, n: o.ums.length, medianUm: Math.round(median(o.ums)) }))
    .sort((a, b) => a.grinder.localeCompare(b.grinder) || parseFloat(a.setting) - parseFloat(b.setting));

  // 전용 링크 목록
  const linkKeys = (await store.list({ prefix: 'links/' })).blobs.map(b => b.key);
  const links = (await Promise.all(linkKeys.map(async k => {
    const v = await store.get(k, { type: 'json' });
    return v ? { code: k.slice(6), ...v } : null;
  }))).filter(Boolean).sort((a, b) => (b.created || '').localeCompare(a.created || ''));

  return {
    statusCode: 200, headers: H,
    body: JSON.stringify({
      days, from: dates[0], to: dates[dates.length - 1],
      visitors: all.visitors.size, appUsers: all.appUsers.size,
      device, source, links, grinders, grindMeasure, counts: all.counts, daily,
    }),
  };
};
