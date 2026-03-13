const ApiClient = (() => {

  function getWorkerUrl() {
    return (localStorage.getItem('kl_workerUrl') || '').replace(/\/$/, '');
  }

  async function apiFetch(endpoint, options = {}) {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      throw new ApiError('Worker URL이 설정되지 않았습니다.\n우측 상단 API 설정에서 Cloudflare Worker URL을 입력해주세요.', 'NO_WORKER_URL');
    }
    const url = `${workerUrl}${endpoint}`;
    let response;
    try {
      response = await fetch(url, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      });
    } catch (networkErr) {
      throw new ApiError(
        `네트워크 오류가 발생했습니다.\nWorker URL(${workerUrl})에 접근할 수 없습니다.`,
        'NETWORK_ERROR'
      );
    }
    if (!response.ok) {
      let errBody = {};
      try { errBody = await response.json(); } catch {}
      throw new ApiError(
        errBody.error || `API 오류가 발생했습니다. (HTTP ${response.status})`,
        'API_ERROR', response.status, errBody.detail
      );
    }
    return response.json();
  }

  async function fetchKeywordData(keywords) {
    const data = await apiFetch('/keyword', {
      method: 'POST',
      body: JSON.stringify({ keywords }),
    });
    return data.keywords || [];
  }

  async function fetchTrendData(keywords, period = 3, device = 'all') {
    const { startDate, endDate } = getPeriodDates(period);
    const deviceParam = device === 'all' ? undefined : device;
    const data = await apiFetch('/trend', {
      method: 'POST',
      body: JSON.stringify({ keywords, startDate, endDate, device: deviceParam }),
    });
    return parseTrendResponse(data, keywords);
  }

  function getPeriodDates(months) {
    const end   = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - months);
    start.setDate(1);
    end.setDate(1);
    end.setDate(0);
    return { startDate: formatDate(start), endDate: formatDate(end) };
  }

  function formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function parseTrendResponse(raw, requestedKeywords) {
    const results = raw.results || [];
    const trendMap = {};
    results.forEach(group => {
      const kw = group.title;
      trendMap[kw] = group.data.map(d => ({
        period: d.period.substring(0, 7),
        ratio:  Math.round(d.ratio),
      }));
    });
    return requestedKeywords.map(kw => ({
      keyword: kw,
      data: trendMap[kw] || [],
    }));
  }

  async function healthCheck() {
    return apiFetch('/health');
  }

  return { fetchKeywordData, fetchTrendData, healthCheck, getPeriodDates, formatDate };

})();

class ApiError extends Error {
  constructor(message, code, status, detail) {
    super(message);
    this.name   = 'ApiError';
    this.code   = code;
    this.status = status;
    this.detail = detail;
  }
}
