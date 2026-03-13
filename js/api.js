/* ===================================================
   api.js - 실제 네이버 API 호출 모듈
   Cloudflare Worker를 프록시로 사용
=================================================== */

const ApiClient = (() => {

  function getWorkerUrl() {
    return (localStorage.getItem('kl_workerUrl') || '').replace(/\/$/, '');
  }

  async function apiFetch(endpoint, options) {
    if (!options) options = {};
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
      throw new ApiError('Worker URL이 설정되지 않았습니다.\n우측 상단 API 설정에서 Cloudflare Worker URL을 입력해주세요.', 'NO_WORKER_URL');
    }

    const url = workerUrl + endpoint;
    let response;
    try {
      response = await fetch(url, {
        method: options.method || 'GET',
        headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
        body: options.body || undefined,
      });
    } catch (networkErr) {
      throw new ApiError(
        '네트워크 오류가 발생했습니다.\nWorker URL(' + workerUrl + ')에 접근할 수 없습니다.\nCloudflare Worker가 배포되어 있는지 확인해주세요.',
        'NETWORK_ERROR'
      );
    }

    if (!response.ok) {
      let errBody = {};
      try { errBody = await response.json(); } catch(e) {}
      throw new ApiError(
        errBody.error || 'API 오류가 발생했습니다. (HTTP ' + response.status + ')',
        'API_ERROR',
        response.status,
        errBody.detail
      );
    }

    return response.json();
  }

  async function fetchKeywordData(keywords) {
    const data = await apiFetch('/keyword', {
      method: 'POST',
      body: JSON.stringify({ keywords: keywords }),
    });
    return data.keywords || [];
  }

  async function fetchDemographicData(keywords, period) {
    if (!period) period = 3;
    const dates = getPeriodDates(period);
    const data = await apiFetch('/demographic', {
      method: 'POST',
      body: JSON.stringify({ keywords: keywords, startDate: dates.startDate, endDate: dates.endDate }),
    });
    return data.demographics || {};
  }

  async function fetchTrendData(keywords, period, device) {
    if (!period) period = 3;
    if (!device) device = 'all';
    const dates = getPeriodDates(period);
    const deviceParam = device === 'all' ? undefined : device;

    const body = { keywords: keywords, startDate: dates.startDate, endDate: dates.endDate };
    if (deviceParam) body.device = deviceParam;

    const data = await apiFetch('/trend', {
      method: 'POST',
      body: JSON.stringify(body),
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
    return {
      startDate: formatDate(start),
      endDate:   formatDate(end),
    };
  }

  function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function parseTrendResponse(raw, requestedKeywords) {
    const results = raw.results || [];
    const trendMap = {};
    results.forEach(function(group) {
      trendMap[group.title] = group.data.map(function(d) {
        return { period: d.period.substring(0, 7), ratio: Math.round(d.ratio) };
      });
    });
    return requestedKeywords.map(function(kw) {
      return { keyword: kw, data: trendMap[kw] || [] };
    });
  }

  async function healthCheck() {
    return apiFetch('/health');
  }

  return {
    fetchKeywordData:      fetchKeywordData,
    fetchDemographicData:  fetchDemographicData,
    fetchTrendData:        fetchTrendData,
    healthCheck:           healthCheck,
    getPeriodDates:        getPeriodDates,
    formatDate:            formatDate,
  };

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
