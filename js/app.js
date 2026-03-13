function isApiMode() {
  return !!localStorage.getItem('kl_workerUrl');
}

let keywords = [];
let analysisData = [];
let rawTrendData = [];
let activeTab = 'overview';
let activeTargetKwIndex = 0;
let trendPeriod = 3;
let trendDevice = 'all';

const keywordInput   = document.getElementById('keywordInput');
const keywordTags    = document.getElementById('keywordTags');
const kwCount        = document.getElementById('kwCount');
const btnAnalyze     = document.getElementById('btnAnalyze');
const btnClear       = document.getElementById('btnClear');
const resultsSection = document.getElementById('resultsSection');
const emptyState     = document.getElementById('emptyState');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingStatus  = document.getElementById('loadingStatus');
const modalOverlay   = document.getElementById('modalOverlay');
const btnSettings    = document.getElementById('btnSettings');
const modalClose     = document.getElementById('modalClose');
const modalCancel    = document.getElementById('modalCancel');
const modalSave      = document.getElementById('modalSave');

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
      <button class="tag-remove" data-kw="${kw}" title="삭제"><i class="fa-solid fa-xmark"></i></button>
    </span>
  `).join('');
  kwCount.textContent = keywords.length;
  btnAnalyze.disabled = keywords.length === 0;
  keywordTags.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); removeKeyword(btn.dataset.kw); });
  });
}

keywordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addKeyword(keywordInput.value); }
  if (e.key === 'Backspace' && !keywordInput.value && keywords.length > 0) removeKeyword(keywords[keywords.length - 1]);
});

keywordInput.addEventListener('input', (e) => {
  if (e.target.value.includes(',') || e.target.value.includes('，')) {
    const parts = e.target.value.split(/[,，]/);
    parts.slice(0, -1).forEach(p => addKeyword(p));
    e.target.value = parts[parts.length - 1];
  }
});

document.getElementById('keywordInputArea').addEventListener('click', () => keywordInput.focus());

document.querySelectorAll('.suggestion-chip').forEach(chip => {
  chip.addEventListener('click', () => addKeyword(chip.dataset.kw));
});

btnClear.addEventListener('click', () => {
  keywords = []; analysisData = []; rawTrendData = [];
  renderTags();
  resultsSection.style.display = 'none';
  emptyState.style.display = '';
  destroyAllCharts();
});

btnAnalyze.addEventListener('click', runAnalysis);

async function runAnalysis() {
  if (keywords.length === 0) return;
  showLoading(true, '분석 준비 중...');
  try {
    if (isApiMode()) await runRealAnalysis();
    else await runMockAnalysis();
    activeTargetKwIndex = 0;
    showLoading(false);
    renderResults();
  } catch (err) {
    showLoading(false);
    handleApiError(err);
  }
}

async function runRealAnalysis() {
  updateLoadingStatus('키워드 데이터 조회 중...');
  const kwResults = await ApiClient.fetchKeywordData(keywords);
  updateLoadingStatus('검색 트렌드 수집 중...');
  const trendResults = await ApiClient.fetchTrendData(keywords, trendPeriod, trendDevice);
  updateLoadingStatus('결과 처리 중...');
  analysisData = mergeApiResults(kwResults, trendResults, keywords);
  rawTrendData = trendResults;
}

async function runMockAnalysis() {
  const steps = ['검색광고 API 연결 중...', '키워드 데이터 조회 중...', '트렌드 데이터 수집 중...', '결과 처리 중...'];
  for (let i = 0; i < steps.length; i++) { updateLoadingStatus(steps[i]); await sleep(250); }
  analysisData = generateMockData(keywords);
  rawTrendData = null;
}

function mergeApiResults(kwResults, trendResults, requestedKeywords) {
  return requestedKeywords.map((kw, idx) => {
    const kwData = kwResults.find(r => r.keyword === kw) || {};
    const trend  = trendResults.find(r => r.keyword === kw) || { data: [] };
    const compScore = { low: 100, mid: 60, high: 30 }[kwData.competition || 'low'];
    const total = kwData.totalSearch || 1;
    const avgCtr = ((kwData.pcCtr || 0) + (kwData.moCtr || 0)) / 2;
    const efficiencyScore = Math.round((Math.log10(Math.max(total, 10)) / 5) * 35 + (avgCtr / 6) * 35 + (compScore / 100) * 30);
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
      keyword: kw, color: KEYWORD_COLORS[idx % KEYWORD_COLORS.length], index: idx,
      found: kwData.found !== false,
      totalSearch: kwData.totalSearch || 0, pcSearch: kwData.pcSearch || 0, mobileSearch: kwData.mobileSearch || 0,
      pcRatio: kwData.pcRatio || 50, mobileRatio: kwData.mobileRatio || 50,
      pcCtr: kwData.pcCtr || 0, moCtr: kwData.moCtr || 0,
      pcClicks: kwData.pcClicks || 0, moClicks: kwData.moClicks || 0,
      competition: kwData.competition || 'low', competitionLabel: kwData.competitionLabel || '낮음',
      maleRatio: kwData.maleRatio || 50, femaleRatio: kwData.femaleRatio || 50,
      ageRatio: kwData.ageRatio || getDefaultAgeRatio(),
      trendData: trendByDevice, trendDirection,
      efficiencyScore: Math.min(99, Math.max(10, efficiencyScore)),
    };
  });
}

function getDefaultAgeRatio() {
  return [{ label:'10대',ratio:5 },{ label:'20대',ratio:20 },{ label:'30대',ratio:30 },{ label:'40대',ratio:25 },{ label:'50대',ratio:15 },{ label:'60대+',ratio:5 }];
}

async function refreshTrendData() {
  if (!isApiMode() || !analysisData.length) { renderTrendChart(analysisData, trendPeriod, trendDevice); return; }
  try {
    updateLoadingStatus('트렌드 업데이트 중...');
    loadingOverlay.style.display = 'flex';
    resultsSection.style.display = 'none';
    const trendResults = await ApiClient.fetchTrendData(keywords, trendPeriod, trendDevice);
    trendResults.forEach(tr => {
      const target = analysisData.find(d => d.keyword === tr.keyword);
      if (target) {
        target.trendData = { all: tr.data, pc: tr.data, mo: tr.data };
        const arr = tr.data;
        if (arr.length >= 2) {
          const last = arr[arr.length - 1].ratio;
          const prev = arr[arr.length - 2].ratio;
          target.trendDirection = last > prev + 5 ? 'up' : last < prev - 5 ? 'down' : 'flat';
        }
      }
    });
    loadingOverlay.style.display = 'none';
    resultsSection.style.display = '';
    renderTrendChart(analysisData, trendPeriod, trendDevice);
  } catch (err) {
    loadingOverlay.style.display = 'none';
    resultsSection.style.display = '';
    handleApiError(err);
    renderTrendChart(analysisData, trendPeriod, trendDevice);
  }
}

function handleApiError(err) {
  console.error('[API Error]', err);
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'NO_WORKER_URL':
        showErrorModal('⚙️ Worker URL 미설정', 'Cloudflare Worker URL이 설정되지 않았습니다.\n우측 상단 <b>API 설정</b>을 눌러 Worker URL을 입력해주세요.',
          () => { modalOverlay.style.display = 'flex'; loadApiSettings(); }); break;
      case 'NETWORK_ERROR':
        showErrorModal('🌐 네트워크 오류', `Worker에 연결할 수 없습니다.\n\n<code>${localStorage.getItem('kl_workerUrl') || ''}</code>\n\n위 URL이 올바른지 확인해주세요.`); break;
      case 'API_ERROR':
        showErrorModal(`❌ API 오류 (${err.status})`, err.message + (err.detail ? `\n\n<small style="color:#94A3B8">${err.detail}</small>` : '')); break;
      default: showToast(err.message, 'error');
    }
  } else { showToast('예기치 않은 오류가 발생했습니다.', 'error'); }
  if (!analysisData.length) {
    analysisData = generateMockData(keywords);
    renderResults();
    showToast('⚠️ API 오류로 Mock 데이터를 표시합니다.', 'error');
  }
}

function showErrorModal(title, html, onAction) {
  const existing = document.getElementById('errorModal');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'errorModal'; el.className = 'modal-overlay'; el.style.cssText = 'display:flex;z-index:300';
  el.innerHTML = `<div class="modal" style="max-width:420px"><div class="modal-header"><h3 style="font-size:15px">${title}</h3><button class="modal-close" id="errorModalClose"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><p style="font-size:13px;color:var(--text-secondary);line-height:1.8;white-space:pre-wrap">${html}</p></div><div class="modal-footer">${onAction ? `<button class="btn-modal-save" id="errorModalAction">설정 열기</button>` : ''}<button class="btn-modal-cancel" id="errorModalClose2">닫기</button></div></div>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.querySelector('#errorModalClose').addEventListener('click', close);
  el.querySelector('#errorModalClose2').addEventListener('click', close);
  el.addEventListener('click', e => { if (e.target === el) close(); });
  if (onAction) el.querySelector('#errorModalAction')?.addEventListener('click', () => { close(); onAction(); });
}

function showLoading(show, msg) {
  loadingOverlay.style.display = show ? 'flex' : 'none';
  if (show) { resultsSection.style.display = 'none'; emptyState.style.display = 'none'; if (msg) updateLoadingStatus(msg); }
}

function updateLoadingStatus(msg) { if (loadingStatus) loadingStatus.textContent = msg; }

function renderResults() {
  destroyAllCharts();
  emptyState.style.display = 'none';
  resultsSection.style.display = '';
  updateModeBadge();
  renderOverview(); renderTarget(); renderTrend(); renderEfficiency();
  switchTab('overview');
}

function updateModeBadge() {
  let badge = document.getElementById('modeBadge');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'modeBadge';
    badge.style.cssText = 'font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;margin-left:8px;';
    document.querySelector('.logo')?.appendChild(badge);
  }
  if (isApiMode()) { badge.textContent = 'LIVE'; badge.style.background = '#DCFCE7'; badge.style.color = '#15803D'; }
  else { badge.textContent = 'MOCK'; badge.style.background = '#FEF9C3'; badge.style.color = '#A16207'; }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tab}`));
}

function renderOverview() {
  document.getElementById('overviewGrid').innerHTML = analysisData.map(d => buildOverviewCard(d)).join('');
}

function buildOverviewCard(d) {
  const compClass = { high:'comp-high', mid:'comp-mid', low:'comp-low' }[d.competition];
  const trendIcon = { up:'↑', down:'↓', flat:'→' }[d.trendDirection];
  const trendColor = { up:'#10B981', down:'#EF4444', flat:'#94A3B8' }[d.trendDirection];
  const maxAge = Math.max(...d.ageRatio.map(a => a.ratio));
  const ageBars = d.ageRatio.map(a => `<div class="age-bar-col"><div class="age-bar-fill" style="height:${Math.round((a.ratio/maxAge)*36)}px;background:${a.ratio===maxAge?d.color:d.color+'55'}"></div><span class="age-bar-lbl">${a.label.replace('대','')}</span></div>`).join('');
  const notFoundBadge = !d.found ? `<span style="font-size:10px;background:#FEF2F2;color:#EF4444;padding:2px 7px;border-radius:10px;font-weight:600">데이터 없음</span>` : '';
  return `<div class="kw-card">
    <div class="kw-card-header">
      <div class="kw-color-dot" style="background:${d.color}"></div>
      <span class="kw-card-title">${d.keyword}</span>${notFoundBadge}
      <span class="kw-competition ${compClass}"><span class="comp-dot"></span>${d.competitionLabel}</span>
      <span style="font-size:13px;font-weight:700;color:${trendColor}">${trendIcon}</span>
    </div>
    <div class="kw-stats-main">
      <div class="stat-item"><div class="stat-label">월 총 검색량</div><div class="stat-value highlight">${formatNumber(d.totalSearch)}</div><div class="stat-sub">최근 1개월</div></div>
      <div class="stat-item"><div class="stat-label">PC 검색량</div><div class="stat-value">${formatNumber(d.pcSearch)}</div><div class="stat-sub">${d.pcRatio}%</div></div>
      <div class="stat-item"><div class="stat-label">MO 검색량</div><div class="stat-value">${formatNumber(d.mobileSearch)}</div><div class="stat-sub">${d.mobileRatio}%</div></div>
    </div>
    <div class="device-split">
      <div class="device-split-label">
        <span class="pc"><i class="fa-solid fa-desktop" style="font-size:10px"></i> PC ${d.pcRatio}%</span>
        <span class="mo"><i class="fa-solid fa-mobile-screen-button" style="font-size:10px"></i> MO ${d.mobileRatio}%</span>
      </div>
      <div class="device-bar"><div class="device-bar-pc" style="width:${d.pcRatio}%"></div><div class="device-bar-mo" style="width:${d.mobileRatio}%"></div></div>
    </div>
    <div class="kw-mini-charts">
      <div class="mini-chart-box"><div class="mini-chart-title">성별 비율</div><div class="gender-bars">
        <div class="gender-row"><span class="gender-icon male"><i class="fa-solid fa-mars"></i></span><div class="gender-bar-wrap"><div class="gender-bar-fill male" style="width:${d.maleRatio}%"></div></div><span class="gender-pct">${d.maleRatio}%</span></div>
        <div class="gender-row"><span class="gender-icon female"><i class="fa-solid fa-venus"></i></span><div class="gender-bar-wrap"><div class="gender-bar-fill female" style="width:${d.femaleRatio}%"></div></div><span class="gender-pct">${d.femaleRatio}%</span></div>
      </div></div>
      <div class="mini-chart-box"><div class="mini-chart-title">연령대</div><div class="age-bars">${ageBars}</div></div>
    </div>
    <div class="ctr-badges">
      <div class="ctr-badge pc-badge"><div class="ctr-badge-label">PC CTR</div><div class="ctr-badge-value">${d.pcCtr}%</div><div class="ctr-badge-sub">${formatNumber(d.pcClicks)} 클릭</div></div>
      <div class="ctr-badge mo-badge"><div class="ctr-badge-label">MO CTR</div><div class="ctr-badge-value">${d.moCtr}%</div><div class="ctr-badge-sub">${formatNumber(d.moClicks)} 클릭</div></div>
    </div>
  </div>`;
}

function renderTarget() {
  const nav = document.getElementById('targetKeywordNav');
  nav.innerHTML = analysisData.map((d, i) => `
    <button class="target-kw-btn${i===activeTargetKwIndex?' active':''}" data-idx="${i}"
      style="${i===activeTargetKwIndex?`background:${d.color};border-color:${d.color}`:''}">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${d.color};margin-right:5px;vertical-align:middle"></span>
      ${d.keyword}
    </button>`).join('');
  nav.querySelectorAll('.target-kw-btn').forEach(btn => {
    btn.addEventListener('click', () => { activeTargetKwIndex = parseInt(btn.dataset.idx); renderTarget(); renderTargetCharts(analysisData[activeTargetKwIndex]); });
  });
  renderTargetCharts(analysisData[activeTargetKwIndex]);
}

function renderTargetCharts(d) {
  const container = document.getElementById('targetCharts');
  const dominantGender = d.maleRatio >= d.femaleRatio ? `남성 (${d.maleRatio}%)` : `여성 (${d.femaleRatio}%)`;
  const topAge  = [...d.ageRatio].sort((a,b) => b.ratio-a.ratio)[0];
  const topAge2 = [...d.ageRatio].sort((a,b) => b.ratio-a.ratio)[1];
  container.innerHTML = `
    <div class="target-chart-card">
      <h3><i class="fa-solid fa-venus-mars" style="color:${d.color}"></i> 성별 분포</h3>
      <p class="target-chart-subtitle">"${d.keyword}" 키워드 검색 성별 비율</p>
      <div class="gender-donut-wrap">
        <canvas id="genderDonut_${d.index}" width="160" height="160"></canvas>
        <div class="gender-legend">
          <div class="gender-legend-item"><div class="legend-dot" style="background:#3B82F6"></div><span class="legend-label"><i class="fa-solid fa-mars" style="color:#3B82F6"></i> 남성</span><div><div class="legend-pct">${d.maleRatio}%</div><div class="legend-count">${formatNumber(Math.round(d.totalSearch*d.maleRatio/100))}건</div></div></div>
          <div class="gender-legend-item"><div class="legend-dot" style="background:#EC4899"></div><span class="legend-label"><i class="fa-solid fa-venus" style="color:#EC4899"></i> 여성</span><div><div class="legend-pct">${d.femaleRatio}%</div><div class="legend-count">${formatNumber(Math.round(d.totalSearch*d.femaleRatio/100))}건</div></div></div>
        </div>
      </div>
      <div class="insight-box"><span class="insight-icon">💡</span><span class="insight-text"><strong>"${d.keyword}"</strong> 키워드는 <strong>${dominantGender}</strong>이 주로 검색합니다.</span></div>
    </div>
    <div class="target-chart-card">
      <h3><i class="fa-solid fa-chart-bar" style="color:${d.color}"></i> 연령대 분포</h3>
      <p class="target-chart-subtitle">"${d.keyword}" 키워드 검색 연령대 비율</p>
      <div class="age-chart-wrap" style="height:200px"><canvas id="ageBar_${d.index}"></canvas></div>
      <div class="insight-box"><span class="insight-icon">🎯</span><span class="insight-text">주요 검색 연령은 <strong>${topAge.label} (${topAge.ratio}%)</strong>, <strong>${topAge2.label} (${topAge2.ratio}%)</strong> 순입니다.</span></div>
    </div>
    <div class="target-chart-card" style="grid-column:span 2;">
      <h3><i class="fa-solid fa-mobile-screen-button" style="color:${d.color}"></i> 기기별 검색 비율 및 클릭 효율</h3>
      <p class="target-chart-subtitle">"${d.keyword}" PC vs 모바일 상세 비교</p>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:16px;margin-top:8px">
        ${buildDeviceStatBox('PC', d.pcSearch, d.pcRatio, d.pcCtr, d.pcClicks, '#4F46E5')}
        ${buildDeviceStatBox('모바일', d.mobileSearch, d.mobileRatio, d.moCtr, d.moClicks, '#03C75A')}
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">경쟁도</div>
          <div class="comp-badge ${d.competition}" style="font-size:16px;justify-content:center;padding:8px 16px"><span class="comp-dot"></span>${d.competitionLabel}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:8px">${d.competition==='high'?'경쟁이 매우 치열한 키워드입니다':d.competition==='mid'?'적당한 경쟁 수준의 키워드입니다':'경쟁이 낮아 진입하기 좋습니다'}</div>
        </div>
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">효율 점수</div>
          <div style="font-size:36px;font-weight:800;color:${getScoreColor(d.efficiencyScore)}">${d.efficiencyScore}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${d.efficiencyScore>=70?'🟢 광고 효율 우수':d.efficiencyScore>=45?'🟡 광고 효율 보통':'🔴 광고 효율 낮음'}</div>
        </div>
      </div>
    </div>`;
  setTimeout(() => { renderGenderDonut(`genderDonut_${d.index}`, d, d.keyword); renderAgeBar(`ageBar_${d.index}`, d.ageRatio, d.color); }, 50);
}

function buildDeviceStatBox(label, search, ratio, ctr, clicks, color) {
  return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:20px">
    <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">${label==='PC'?'<i class="fa-solid fa-desktop"></i>':'<i class="fa-solid fa-mobile-screen-button"></i>'} ${label}</div>
    <div style="margin-bottom:8px"><div style="font-size:11px;color:var(--text-muted)">검색량</div><div style="font-size:20px;font-weight:800;color:${color}">${formatNumber(search)}</div><div style="font-size:11px;color:var(--text-muted)">(전체 ${ratio}%)</div></div>
    <div style="display:flex;gap:12px;margin-top:10px"><div><div style="font-size:10px;color:var(--text-muted)">CTR</div><div style="font-size:16px;font-weight:700;color:${color}">${ctr}%</div></div><div><div style="font-size:10px;color:var(--text-muted)">월 예상클릭</div><div style="font-size:16px;font-weight:700;color:var(--text-primary)">${formatNumber(clicks)}</div></div></div>
  </div>`;
}

function renderTrend() { renderTrendChart(analysisData, trendPeriod, trendDevice); renderTrendLegend(analysisData); }

document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    trendPeriod = parseInt(btn.dataset.period);
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (analysisData.length > 0) await refreshTrendData();
  });
});

document.querySelectorAll('.device-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    trendDevice = btn.dataset.device;
    document.querySelectorAll('.device-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (analysisData.length > 0) { if (isApiMode()) await refreshTrendData(); else renderTrendChart(analysisData, trendPeriod, trendDevice); }
  });
});

function renderEfficiency() {
  const tbody = document.getElementById('efficiencyTableBody');
  const sorted = [...analysisData].sort((a,b) => b.efficiencyScore-a.efficiencyScore);
  tbody.innerHTML = sorted.map((d, rank) => {
    const scoreColor = getScoreColor(d.efficiencyScore);
    return `<tr>
      <td><div class="kw-name-cell"><span style="font-size:12px;color:var(--text-muted);font-weight:700;min-width:16px">${rank+1}</span><div class="kw-dot-sm" style="background:${d.color}"></div>${d.keyword}${!d.found?'<span style="font-size:10px;background:#FEF2F2;color:#EF4444;padding:1px 5px;border-radius:6px;margin-left:4px">미수집</span>':''}</div></td>
      <td class="num-value">${formatNumber(d.totalSearch)}</td>
      <td class="num-value">${formatNumber(d.pcClicks)}</td>
      <td class="num-value">${formatNumber(d.moClicks)}</td>
      <td class="ctr-value" style="color:#4F46E5">${d.pcCtr}%</td>
      <td class="ctr-value" style="color:#03C75A">${d.moCtr}%</td>
      <td><span class="comp-badge ${d.competition}"><span class="comp-dot"></span>${d.competitionLabel}</span></td>
      <td><div class="score-bar-wrap"><div class="score-bar-bg"><div class="score-bar-fill" style="width:${d.efficiencyScore}%;background:${scoreColor}"></div></div><span class="score-num" style="color:${scoreColor}">${d.efficiencyScore}</span></div></td>
    </tr>`;
  }).join('');
}

btnSettings.addEventListener('click', () => { loadApiSettings(); modalOverlay.style.display = 'flex'; });
[modalClose, modalCancel].forEach(el => { el.addEventListener('click', () => { modalOverlay.style.display = 'none'; }); });
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.style.display = 'none'; });
modalSave.addEventListener('click', () => { saveApiSettings(); modalOverlay.style.display = 'none'; updateModeBadge(); showToast('✅ API 설정이 저장되었습니다.', 'success'); });

function saveApiSettings() {
  const el = document.getElementById('workerUrl');
  const val = el?.value?.trim();
  if (val) localStorage.setItem('kl_workerUrl', val);
  else localStorage.removeItem('kl_workerUrl');
}

function loadApiSettings() {
  const el = document.getElementById('workerUrl');
  if (el) el.value = localStorage.getItem('kl_workerUrl') || '';
}

function showToast(msg, type = '') {
  let toast = document.getElementById('globalToast');
  if (!toast) { toast = document.createElement('div'); toast.id = 'globalToast'; toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => toast.classList.remove('show'), 2800);
}

function saveAndClose() {
  saveApiSettings();
  document.getElementById('modalOverlay').style.display = 'none';
  updateModeBadge();
  showToast('✅ API 설정이 저장되었습니다.', 'success');
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

renderTags();
updateModeBadge();
