const https = require('https');

// Google Sheets CSV 공개 URL (웹에 게시된 CSV)
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/11PFaQ0cLD3xNHz60GlsLDpvqVAvFptOAbA6HsPQGDAg/export?format=csv&gid=0';
const PURCHASE_URL = 'https://maekeo.com/surl/O/97';

function fetchCSV(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      // 리다이렉트 처리
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchCSV(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-cache',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { query } = JSON.parse(event.body || '{}');
    if (!query || query.trim().length < 2) {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ verified: false, message: '이름 또는 전화번호를 입력해주세요.' })
      };
    }

    const csv = await fetchCSV(SHEET_CSV_URL);
    const lines = csv.split('\n').slice(1); // 헤더 제거

    console.log('CSV 총 라인:', lines.length);
    console.log('첫 3줄 샘플:', lines.slice(0, 3));

    const input = query.trim().replace(/\s/g, '');
    console.log('입력값:', input);

    const found = lines.some(line => {
      const cols = line.split(',');
      if (cols.length < 2) return false;
      const name  = (cols[0] || '').trim().replace(/\s/g, '').replace(/\r/g, '');
      const phone = (cols[1] || '').trim().replace(/[-\s\r]/g, '');
      const inputPhone = input.replace(/[-\s]/g, '');
      const match = name === input || phone === inputPhone;
      if (match) console.log('매칭됨:', name, phone);
      return match;
    });

    if (found) {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ verified: true, url: PURCHASE_URL })
      };
    } else {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ verified: false, message: '등록된 정보를 찾을 수 없습니다.\n이름 또는 전화번호를 다시 확인해주세요.' })
      };
    }
  } catch(e) {
    console.error('verify-buyer 오류:', e);
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ verified: false, message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' })
    };
  }
};
