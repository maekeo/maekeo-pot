export async function onRequestPost(context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const body = await context.request.json();
    const { image } = body;

    if (!image) {
      return new Response(JSON.stringify({ error: '이미지 없음' }), { status: 400, headers });
    }

    const apiKey = context.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY 미설정' }), { status: 500, headers });
    }

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
5. 미분(매우 작은 입자)과 일반 입자 구분하여 균일도 계산
6. 사진에 100원(24mm) 또는 500원(26.5mm) 동전이 있다면 기준점으로 역산

[매커포트 기준]
최적 분쇄도: 300~500μm

JSON만 반환:
{"level":"극세분/세분/중간/굵게/아주굵게","levelKor":"한글명","percent":숫자,"particleSize":숫자,"uniformity":숫자,"mokaFit":"최적/약간 고움/많이 고움/약간 굵음/많이 굵음","bestBrew":"추출방식","advice":"2문장","confidence":"high/mid/low","isCoffee":true}` }
          ]
        }]
      })
    });

    if (!res.ok) {
      if (res.status === 401) return new Response(JSON.stringify({ error: 'API 키 오류' }), { status: 401, headers });
      if (res.status === 429) return new Response(JSON.stringify({ error: '한도 초과' }), { status: 429, headers });
      return new Response(JSON.stringify({ error: `오류 ${res.status}` }), { status: res.status, headers });
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    if (!text) return new Response(JSON.stringify({ error: '응답 없음' }), { status: 500, headers });

    let result;
    try { result = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch { const m = text.match(/\{[\s\S]*\}/); if (!m) return new Response(JSON.stringify({ error: '파싱 실패' }), { status: 500, headers }); result = JSON.parse(m[0]); }

    return new Response(JSON.stringify({ result }), { status: 200, headers });

  } catch(err) {
    return new Response(JSON.stringify({ error: err.message || '서버 오류' }), { status: 500, headers });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
