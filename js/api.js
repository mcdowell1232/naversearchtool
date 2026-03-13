/* ===================================================
   api.js - 실제 네이버 API 호출 모듈
   Cloudflare Worker를 프록시로 사용
=================================================== */

const ApiClient = (() => {

  // ── Worker URL 가져오기 ──────────────────────────
  function getWorkerUrl() {
    return (localStorage.getItem('kl_workerUrl') || '').replace(/\/$/, '');
  }

  // ── 공통 fetch 래퍼 ─────────────────────────────
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
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });
    } catch (networkErr) {
      throw new ApiError(
        `네트워크 오류가 발생했습니다.\nWorker URL(${workerUrl})에 접근할 수 없습니다.\nCloudflare Worker가 배포되어 있는지 확인해주세요.`,
        'NETWORK_ERROR'
      );
    }

    if (!response.ok) {
      let errBody = {};
      try { errBody = await response.json(); } catch {}
      throw new ApiError(
        errBody.error || `API 오류가 발생했습니다. (HTTP ${response.status})`,
        'API_ERROR',
        response.status,
        errBody.detail
      );
    }

    return response.json();
  }

  // ── 키워드 데이터 조회 ──────────────────────────
  // 반환: [ { keyword, found, totalSearch, pcSearch, mobileSearch,
  //           pcRatio, mobileRatio, pcCtr, moCtr, pcClicks, moClicks,
  //           competition, competitionLabel } ]
  async function fetchKeywordData(keywords) {
    const data = await apiFetch('/keyword', {
      method: 'POST',
      body: JSON.stringify({ keywords }),
    });
    return data.keywords || [];
  }

  // ── 성별/연령 인구통계 조회 (데이터랩) ──────────
  // 반환: { keyword: { maleRatio, femaleRatio, ageRatio } }
  async function fetchDemographicData(keywords, period = 3) {
    const { startDate, endDate } = getPeriodDates(period);
    const data = await apiFetch('/demographic', {
      method: 'POST',
      body: JSON.stringify({ keywords, startDate, endDate }),
    });
    return data.demographics || {};
  }

  // ── 트렌드 데이터 조회 ──────────────────────────
  // period: 1 | 3 | 6 | 12 (개월)
  // device: 'all' | 'pc' | 'mo'
  async function fetchTrendData(keywords, period = 3, device = 'all') {
    const { startDate, endDate } = getPeriodDates(period);
    const deviceParam = device === 'all' ? undefined : device;

    const data = await apiFetch('/trend', {
      method: 'POST',
      body: JSON.stringify({
        keywords,
        startDate,
        endDate,
        device: deviceParam,
      }),
    });

    return parseTrendResponse(data, keywords);
  }

  // ── 날짜 범위 계산 ──────────────────────────────
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
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // ── 트렌드 응답 파싱 ────────────────────────────
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

  // ── 헬스체크 ────────────────────────────────────
  async function healthCheck() {
    return apiFetch('/health');
  }

  // ── 공개 인터페이스 ─────────────────────────────
  return {
    fetchKeywordData,
    fetchDemographicData,
    fetchTrendData,
    healthCheck,
    getPeriodDates,
    formatDate,
  };

})();

// ── 커스텀 에러 클래스 ──────────────────────────────
class ApiError extends Error {
  constructor(message, code, status, detail) {
    super(message);
    this.name    = 'ApiError';
    this.code    = code;
    this.status  = status;
    this.detail  = detail;
  }
}
