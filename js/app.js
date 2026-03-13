/* ===================================================
   app.js - 메인 애플리케이션 로직 (실제 API 연동)
=================================================== */

// ── 모드 감지 ─────────────────────────────────────
function isApiMode() {
  return !!localStorage.getItem('kl_workerUrl');
}

// ── 상태 ──────────────────────────────────────────
let keywords = [];
let analysisData = [];
let rawTrendData = [];
let activeTab = 'overview';
let activeTargetKwIndex = 0;
let trendPeriod = 3;
let trendDevice = 'all';

// ── DOM 참조 ──────────────────────────────────────
const keywordInput    = document.getElementById('keywordInput');
const keywordTags     = document.getElementById('keywordTags');
const kwCount         = document.getElementById('kwCount');
const btnAnalyze      = document.getElementById('btnAnalyze');
const btnClear        = document.getElementById('btnClear');
const resultsSection  = document.getElementById('resultsSection');
const emptyState      = document.getElementById('emptyState');
const loadingOverlay  = document.getElementById('loadingOverlay');
const loadingStatus   = document.getElementById('loadingStatus');
const modalOverlay    = document.getElementById('modalOverlay');
const btnSettings     = document.getElementById('btnSettings');
const modalClose      = document.getElementById('modalClose');
const modalCancel     = document.getElementById('modalCancel');
const modalSave       = document.getElementById('modalSave');

// ── 키워드 태그 관리 ──────────────────────────────
function addKeyword(kw) {
  kw = kw.trim().replace(/[,，]/g, '');
  if (!kw) return;
  if (keywords.length >= 10) { showToast('키워드는 최대 10개까지 입력할 수 있습니다.', 'error'); return; }
  if (keywords.includes(kw)) { showToast(`'${kw}'은(는) 이미 추가된 키워드입니다.`, 'error'); return; }
  keywords.push(kw);
  renderTags();
  keywordInput.value = '';
}

function removeKeyword(kw) {
  keywords = keywords.filter(k => k !== kw);
  renderTags();
}

function renderTags() {
  keywordTags.innerHTML = keywords.map((kw, i) => `
    <span class="keyword-tag" style="background:${KEYWORD_COLORS[i % KEYWORD_COLORS.length]}">
      ${kw}
      <button class="tag-remove" data-kw="${kw}" title="삭제">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </span>
  `).join('');
  kwCount.textContent = keywords.length;
  btnAnalyze.disabled = keywords.length === 0;

  keywordTags.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeKeyword(btn.dataset.kw);
    });
  });
}

// ── 입력 이벤트 ───────────────────────────────────
keywordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    addKeyword(keywordInput.value);
  }
  if (e.key === 'Backspace' && !keywordInput.value && keywords.length > 0) {
    removeKeyword(keywords[keywords.length - 1]);
  }
});

keywordInput.addEventListener('input', (e) => {
  if (e.target.value.includes(',') || e.target.value.includes('，')) {
    const parts = e.target.value.split(/[,，]/);
    parts.slice(0, -1).forEach(p => addKeyword(p));
    e.target.value = parts[parts.length - 1];
  }
});

document.getElementById('keywordInputArea').addEventListener('click', () => {
  keywordInput.focus();
});

document.querySelectorAll('.suggestion-chip').forEach(chip => {
  chip.addEventListener('click', () => addKeyword(chip.dataset.kw));
});

btnClear.addEventListener('click', () => {
  keywords = [];
  analysisData = [];
  rawTrendData = [];
  renderTags();
  resultsSection.style.display = 'none';
  emptyState.style.display = '';
  destroyAllCharts();
});

// ── 분석 실행 ─────────────────────────────────────
btnAnalyze.addEventListener('click', runAnalysis);

async function runAnalysis() {
  if (keywords.length === 0) return;
  showLoading(true, '분석 준비 중...');
  try {
    if (isApiMode()) {
      await runRealAnalysis();
    } else {
      await runMockAnalysis();
    }
    activeTargetKwIndex = 0;
    showLoading(false);
    renderResults();
  } catch (err) {
    showLoading(false);
    handleApiError(err);
  }
}

// ── 실제 API 분석 ─────────────────────────────────
async function runRealAnalysis() {
  // ① 키워드 검색량 + 경쟁도 (검색광고 API)
  updateLoadingStatus('키워드 데이터 조회 중...');
  const kwResults = await ApiClient.fetchKeywordData(keywords);

  // ② 트렌드 + 성별/연령 병렬 조회 (데이터랩)
  updateLoadingStatus('성별/연령 및 트렌드 분석 중...');
  const [trendResults, demoResults] = await Promise.all([
    ApiClient.fetchTrendData(keywords, trendPeriod, trendDevice),
    ApiClient.fetchDemographicData(keywords, trendPeriod),
  ]);

  updateLoadingStatus('결과 처리 중...');
  analysisData = mergeApiResults(kwResults, trendResults, demoResults, keywords);
  rawTrendData = trendResults;
}

// ── Mock 분석 ─────────────────────────────────────
async function runMockAnalysis() {
  const steps = ['검색광고 API 연결 중...','키워드 데이터 조회 중...','트렌드 데이터 수집 중...','결과 처리 중...'];
  for (let i = 0; i < steps.length; i++) {
    updateLoadingStatus(steps[i]);
    await sleep(250);
  }
  const mockData = generateMockData(keywords);
  analysisData = mockData;
  rawTrendData = null;
}

// ── API 결과 → 내부 포맷 변환 ─────────────────────
function mergeApiResults(kwResults, trendResults, demoResults, requestedKeywords) {
  return requestedKeywords.map((kw, idx) => {
    const kwData = kwResults.find(r => r.keyword === kw) || {};
    const trend  = trendResults.find(r => r.keyword === kw) || { data: [] };
    const demo   = (demoResults && demoResults[kw]) || {};

    const compScore = { low: 100, mid: 60, high: 30 }[kwData.competition || 'low'];
    const total = kwData.totalSearch || 1;
    const avgCtr = ((kwData.pcCtr || 0) + (kwData.moCtr || 0)) / 2;
    const efficiencyScore = Math.round(
      (Math.log10(Math.max(total, 10)) / 5) * 35 +
      (avgCtr / 6) * 35 +
      (compScore / 100) * 30
    );

    const trendArr = trend.data || [];
    let trendDirection = 'flat';
    if (trendArr.length >= 2) {
      const last = trendArr[trendArr.length - 1].ratio;
      const prev = trendArr[trendArr.length - 2].ratio;
      if (last > prev + 5) trendDirection = 'up';
      else if (last < prev - 5) trendDirection = 'down';
    }

    const trendByDevice = { all: trendArr, pc: trendArr, mo: trendArr };

    return {
      keyword:          kw,
      color:            KEYWORD_COLORS[idx % KEYWORD_COLORS.length],
      index:            idx,
      found:            kwData.found !== false,
      totalSearch:      kwData.totalSearch      || 0,
      pcSearch:         kwData.pcSearch         || 0,
      mobileSearch:     kwData.mobileSearch     || 0,
      pcRatio:          kwData.pcRatio          || 50,
      mobileRatio:      kwData.mobileRatio      || 50,
      pcCtr:            kwData.pcCtr            || 0,
      moCtr:            kwData.moCtr            || 0,
      pcClicks:         kwData.pcClicks         || 0,
      moClicks:         kwData.moClicks         || 0,
      competition:      kwData.competition      || 'low',
      competitionLabel: kwData.competitionLabel || '낮음',
      // 성별/연령: 데이터랩 demographic 우선, 없으면 기본값
      maleRatio:        demo.maleRatio   !== undefined ? demo.maleRatio   : 50,
      femaleRatio:      demo.femaleRatio !== undefined ? demo.femaleRatio : 50,
      ageRatio:         demo.ageRatio    || getDefaultAgeRatio(),
      trendData:        trendByDevice,
      trendDirection,
      efficiencyScore:  Math.min(99, Math.max(10, efficiencyScore)),
    };
  });
}

function getDefaultAgeRatio() {
  return [
    { label: '10대', ratio: 5  },
    { label: '20대', ratio: 20 },
    { label: '30대', ratio: 30 },
    { label: '40대', ratio: 25 },
    { label: '50대', ratio: 15 },
    { label: '60대+', ratio: 5 },
  ];
}

// ── 트렌드 탭: 기간/기기 변경 시 재조회 ────────────
async function refreshTrendData() {
  if (!isApiMode() || !analysisData.length) {
    renderTrendChart(analysisData, trendPeriod, trendDevice);
    return;
  }
  try {
    showLoading(true, '트렌드 데이터 갱신 중...');
    const trendResults = await ApiClient.fetchTrendData(keywords, trendPeriod, trendDevice);
    rawTrendData = trendResults;
    analysisData = analysisData.map(d => {
      const trend = trendResults.find(r => r.keyword === d.keyword) || { data: [] };
      const trendArr = trend.data || [];
      return { ...d, trendData: { all: trendArr, pc: trendArr, mo: trendArr } };
    });
    showLoading(false);
    renderTrendChart(analysisData, trendPeriod, trendDevice);
  } catch (err) {
    showLoading(false);
    handleApiError(err);
  }
}
