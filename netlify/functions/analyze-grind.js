exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  try {
    const { image } = JSON.parse(event.body || '{}');
    if (!image) return { statusCode: 400, headers, body: JSON.stringify({ error: '이미지 없음' }) };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'OPENAI_API_KEY 미설정' }) };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}`, detail: 'high' } },
            { type: 'text', text: `당신은 커피 분쇄도 전문 분석 AI입니다. 아래 기준으로 정밀하게 분석하세요.

[분석 대상]
흰색 바탕 위에 분쇄된 커피 원두 사진입니다.
커피 원두가 아니면 isCoffee:false로 반환하세요.

[정밀 분석 기준]
1. 입자 경계선 선명도로 촬영 거리 추정 → 크기 보정에 활용
2. 사진을 9구역(3x3)으로 나눠 각 구역 입자 크기 분석 후 평균
3. 단위 면적당 입자 밀도로 상대적 크기 보정
4. 입자 형태(원형에 가까울수록 균일한 분쇄) 판단
5. 입자 색상 명암으로 로스팅 레벨 고려 (밝을수록 라이트, 어두울수록 다크)
6. 미분(매우 작은 입자)과 일반 입자 구분하여 균일도 계산
7. 사진에 100원(24mm) 또는 500원(26.5mm) 동전이 있다면 기준점으로 역산

[매커포트 기준]
최적 분쇄도: 300~500μm
이 범위보다 고우면 과추출(쓴맛), 굵으면 미추출(싱거운맛)

[이미지 품질 판단]
- 초점이 흐리면 confidence를 low로
- 원두 면적이 이미지의 20% 미만이면 confidence를 low로
- 조명이 불균일하면 confidence를 mid로

JSON만 반환 (다른 텍스트 절대 없음):
{"level":"극세분/세분/중간/굵게/아주굵게","levelKor":"한글명","percent":숫자,"particleSize":숫자,"uniformity":숫자,"mokaFit":"최적/약간 고움/많이 고움/약간 굵음/많이 굵음","bestBrew":"추출방식","advice":"2문장","confidence":"high/mid/low","confidenceReason":"이유 한 문장","isCoffee":true}` }
          ]
        }]
      })
    });

    if (!res.ok) {
      const err = await res.text();
      if (res.status === 401) return { statusCode: 401, headers, body: JSON.stringify({ error: 'API 키 오류' }) };
      if (res.status === 429) return { statusCode: 429, headers, body: JSON.stringify({ error: '한도 초과' }) };
      return { statusCode: res.status, headers, body: JSON.stringify({ error: err.slice(0, 200) }) };
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    if (!text) return { statusCode: 500, headers, body: JSON.stringify({ error: '응답 없음' }) };

    let result;
    try { result = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch { const m = text.match(/\{[\s\S]*\}/); if (!m) return { statusCode: 500, headers, body: JSON.stringify({ error: '파싱 실패' }) }; result = JSON.parse(m[0]); }

    return { statusCode: 200, headers, body: JSON.stringify({ result }) };

  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || '서버 오류' }) };
  }
};
