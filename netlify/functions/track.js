// 매커랩 익명 사용 통계 수집
// - 이름·IP·기기 정보 원문을 저장하지 않는다 (기기별 무작위 번호 aid만 사용)
// - 이벤트 1건 = 빈 값의 blob 1개. 내용은 키에 담아 동시 기록 충돌이 없게 함
//   키: YYYY-MM-DD/type/detail/device/mode/aid/시각-난수
const { getStore, connectLambda } = require('@netlify/blobs');

const RULES = {
  visit:   /^(-|direct|app|c-[a-z0-9]{3,12}|r-[a-z0-9-]{2,20})$/,  // 유입 경로: 전용링크(c-코드)·사이트(r-이름)·직접·앱
  tab:     /^(grind|timer|history|fix)$/,
  banner:  /^event$/,
  ev:      /^(limited|sets|beans)$/,
  verify:  /^(ok|fail)$/,
  go:      /^(limited|setmid|setlarge|beans)$/,
  reserve: /^(preorder|onecup|boiler)$/,
  store:   /^(open|beans|parts)$/,
  install: /^android$/,
  guide:   /^[ol]-[a-z0-9]{1,8}$/,  // 가이드: o-항목 펼침 / l-링크·버튼 클릭 (문구 해시)
};
const DEVICES = /^(ios|android|pc|other)$/;
const MODES = /^(app|web)$/;
const AID = /^[a-z0-9]{8,16}$/;

const ok = () => ({ statusCode: 204, headers: { 'Cache-Control': 'no-store' }, body: '' });

function kstDate() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: '' };
  let d;
  try { d = JSON.parse(event.body || '{}'); } catch (e) { return ok(); }
  const type = String(d.t || ''), detail = String(d.d || '-');
  const device = String(d.dv || 'other'), mode = String(d.m || 'web'), aid = String(d.a || '');
  if (!RULES[type] || !RULES[type].test(detail) || !DEVICES.test(device) || !MODES.test(mode) || !AID.test(aid)) return ok();

  try {
    connectLambda(event);
    const store = getStore('stats');
    const key = [kstDate(), type, detail, device, mode, aid, Date.now() + '-' + Math.random().toString(36).slice(2, 7)].join('/');
    await store.set(key, '');
  } catch (e) {
    // 통계 실패는 앱 사용에 영향 주지 않음
  }
  return ok();
};
