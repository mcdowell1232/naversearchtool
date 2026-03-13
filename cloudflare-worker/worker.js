const SEARCHAD_BASE = 'https://api.naver.com';
const DATALAB_BASE  = 'https://openapi.naver.com/v1/datalab';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function makeSignature(timestamp, method, path, secretKey) {
  const message = `${timestamp}.${method}.${path}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
  const msgData = encoder.encode(message);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function getSearchAdHeaders(method, path, env) {
  const timestamp = Date.now().toString();
  const signature = await makeSignature(timestamp, method, path, env.SEARCHAD_SECRET);
  return {
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Timestamp':  timestamp,
    'X-API-KEY':    env.SEARCHAD_API_KEY,
    'X-Customer':   env.SEARCHAD_CUSTOMER,
    'X-Signature':  signature,
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    const pathname = url.pathname;
    try {
      if (pathname === '/keyword' && request.method === 'POST') return await handleKeyword(request, env);
      if (pathname === '/trend'   && request.method === 'POST') return await handleTrend(request, env);
      if (pathname === '/health') return jsonResponse({ status: 'ok', timestamp: Date.now() });
      return jsonResponse({ error: 'Not Found' }, 404);
    } catch (err) {
      return jsonResponse({ error: err.message || 'Internal Server Error' }, 500);
    }
  }
};

async function handleKeyword(request, env) {
  const { keywords } = await request.json();
  if (!Array.isArray(keywords) || !keywords.length) return jsonResponse({ error: 'keywords 배열이 필요합니다.' }, 400);
  if (keywords.length > 10) return jsonResponse({ error: '최대 10개까지 가능합니다.' }, 400);
  const kwPath = '/keywordstool';
  const kwHeaders = await getSearchAdHeaders('GET', kwPath, env);
  const hintParams = keywords.map(k => `hintKeywords=${encodeURIComponent(k)}`).join('&');
  const kwRes = await fetch(`${SEARCHAD_BASE}${kwPath}?showDetail=1&${hintParams}`, { method: 'GET', headers: kwHeaders });
  if (!kwRes.ok) return jsonResponse({ error: `검색광고 API 오류 (${kwRes.status})`, detail: await kwRes.text() }, kwRes.status);
  const kwData = await kwRes.json();
  return jsonResponse(mergeKeywordData(keywords, kwData));
}

function mergeKeywordData(requestedKeywords, kwData) {
  const keywordList = kwData.keywordList || [];
  const result = requestedKeywords.map(reqKw => {
    const match = keywordList.find(k => k.relKeyword === reqKw) || keywordList.find(k => k.relKeyword?.includes(reqKw));
    if (!match) return { keyword: reqKw, found: false, totalSearch:0, pcSearch:0, mobileSearch:0, pcRatio:50, mobileRatio:50, pcCtr:0, moCtr:0, pcClicks:0, moClicks:0, competition:'low', competitionLabel:'낮음', maleRatio:50, femaleRatio:50, ageRatio: getEmptyAgeRatio() };
    const pcSearch     = match.monthlyPcQcCnt     === '< 10' ? 5 : parseInt(match.monthlyPcQcCnt)     || 0;
    const mobileSearch = match.monthlyMobileQcCnt === '< 10' ? 5 : parseInt(match.monthlyMobileQcCnt) || 0;
    const totalSearch  = pcSearch + mobileSearch;
    const pcRatio      = totalSearch > 0 ? Math.round((pcSearch / totalSearch) * 100) : 50;
    const pcCtr    = parseFloat((match.monthlyAvePcClkCnt     / (pcSearch     || 1) * 100).toFixed(2));
    const moCtr    = parseFloat((match.monthlyAveMobileClkCnt / (mobileSearch || 1) * 100).toFixed(2));
    const compMap  = { '높음':'high', '보통':'mid', '낮음':'low' };
    const competition = compMap[match.compIdx] || 'low';
    const compLabelMap = { high:'높음', mid:'보통', low:'낮음' };
    return {
      keyword: match.relKeyword || reqKw, found: true,
      totalSearch, pcSearch, mobileSearch, pcRatio, mobileRatio: 100 - pcRatio,
      pcCtr: Math.min(99, Math.max(0, pcCtr)), moCtr: Math.min(99, Math.max(0, moCtr)),
      pcClicks: match.monthlyAvePcClkCnt || 0, moClicks: match.monthlyAveMobileClkCnt || 0,
      competition, competitionLabel: compLabelMap[competition],
      maleRatio: parseGenderRatio(match).male, femaleRatio: parseGenderRatio(match).female,
      ageRatio: parseAgeRatio(match),
    };
  });
  return { keywords: result };
}

function parseGenderRatio(match) {
  try { const male = Math.round((match.plMaleRatio || 0.5) * 100); return { male, female: 100 - male }; }
  catch { return { male: 50, female: 50 }; }
}

function parseAgeRatio(match) {
  const labels = ['10대','20대','30대','40대','50대','60대+'];
  const fields = ['plAge10RateRatio','plAge20RateRatio','plAge30RateRatio','plAge40RateRatio','plAge50RateRatio','plAge60RateRatio'];
  const values = fields.map(f => Math.round((match[f] || 0) * 100));
  const total  = values.reduce((a,b) => a+b, 0);
  if (total === 0) return getEmptyAgeRatio();
  const normalized = values.map(v => Math.round((v/total)*100));
  const diff = 100 - normalized.reduce((a,b) => a+b, 0);
  normalized[normalized.indexOf(Math.max(...normalized))] += diff;
  return labels.map((label, i) => ({ label, ratio: normalized[i] }));
}

function getEmptyAgeRatio() {
  return [{ label:'10대',ratio:5 },{ label:'20대',ratio:20 },{ label:'30대',ratio:30 },{ label:'40대',ratio:25 },{ label:'50대',ratio:15 },{ label:'60대+',ratio:5 }];
}

async function handleTrend(request, env) {
  const { keywords, startDate, endDate, device = 'all' } = await request.json();
  if (!Array.isArray(keywords) || !keywords.length) return jsonResponse({ error: 'keywords 배열이 필요합니다.' }, 400);
  const groups = keywords.slice(0,5).map(kw => ({ groupName: kw, keywords: [kw] }));
  const payload = { startDate, endDate, timeUnit: 'month', keywordGroups: groups, ...(device !== 'all' && { device }) };
  const headers = { 'Content-Type':'application/json', 'X-Naver-Client-Id': env.NAVER_CLIENT_ID, 'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET };
  const res = await fetch(`${DATALAB_BASE}/search`, { method:'POST', headers, body: JSON.stringify(payload) });
  if (!res.ok) return jsonResponse({ error: `데이터랩 API 오류 (${res.status})`, detail: await res.text() }, res.status);
  const data = await res.json();
  if (keywords.length > 5) {
    const groups2 = keywords.slice(5).map(kw => ({ groupName: kw, keywords: [kw] }));
    const res2 = await fetch(`${DATALAB_BASE}/search`, { method:'POST', headers, body: JSON.stringify({ ...payload, keywordGroups: groups2 }) });
    if (res2.ok) { const data2 = await res2.json(); return jsonResponse({ ...data, results: [...(data.results||[]), ...(data2.results||[])] }); }
  }
  return jsonResponse(data);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}
