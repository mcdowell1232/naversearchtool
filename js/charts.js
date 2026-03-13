Chart.register(ChartDataLabels);

let trendChartInstance = null;
let genderChartInstances = {};
let ageChartInstances = {};

const GENDER_COLORS = { male: '#3B82F6', female: '#EC4899' };
const AGE_COLORS = ['#818CF8', '#A78BFA', '#4F46E5', '#6366F1', '#3B82F6', '#06B6D4'];
const BASE_FONT = { family: "'Pretendard', 'Apple SD Gothic Neo', sans-serif", size: 12 };

function renderGenderDonut(canvasId, data, keyword) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (genderChartInstances[canvasId]) genderChartInstances[canvasId].destroy();
  genderChartInstances[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['남성', '여성'],
      datasets: [{ data: [data.maleRatio, data.femaleRatio], backgroundColor: [GENDER_COLORS.male, GENDER_COLORS.female], borderWidth: 3, borderColor: '#fff', hoverOffset: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: true, cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed}%` } },
        datalabels: { display: false }
      }
    }
  });
}

function renderAgeBar(canvasId, ageRatio, color) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (ageChartInstances[canvasId]) ageChartInstances[canvasId].destroy();
  const maxRatio = Math.max(...ageRatio.map(a => a.ratio));
  ageChartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ageRatio.map(a => a.label),
      datasets: [{
        data: ageRatio.map(a => a.ratio),
        backgroundColor: ageRatio.map(a => a.ratio === maxRatio ? color : color + '55'),
        borderRadius: 6, borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y}%` } },
        datalabels: { anchor: 'end', align: 'end', color: '#475569', font: { ...BASE_FONT, size: 11, weight: '600' }, formatter: (v) => v + '%', offset: -2 }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { font: BASE_FONT, color: '#94A3B8' } },
        y: { display: false, max: maxRatio + 15, beginAtZero: true }
      }
    }
  });
}

function renderTrendChart(allData, period, device) {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;
  if (trendChartInstance) trendChartInstance.destroy();

  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - period + 1, 1);
  const filteredData = allData.map(d => {
    const trend = d.trendData[device];
    const filtered = trend.filter(t => {
      const [y, m] = t.period.split('-').map(Number);
      return new Date(y, m - 1, 1) >= cutoff;
    });
    return { ...d, filteredTrend: filtered };
  });

  const labels = filteredData[0]?.filteredTrend.map(t => formatPeriodLabel(t.period, period <= 3)) || [];
  const datasets = filteredData.map(d => ({
    label: d.keyword,
    data: d.filteredTrend.map(t => t.ratio),
    borderColor: d.color,
    backgroundColor: d.color + '15',
    borderWidth: 2.5,
    pointRadius: 4, pointHoverRadius: 7,
    pointBackgroundColor: d.color, pointBorderColor: '#fff', pointBorderWidth: 2,
    fill: filteredData.length === 1, tension: 0.35
  }));

  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15,23,42,.92)',
          titleFont: { ...BASE_FONT, size: 13, weight: '600' },
          bodyFont: { ...BASE_FONT, size: 13 },
          padding: 12, cornerRadius: 10,
          callbacks: { label: (ctx) => `  ${ctx.dataset.label}: ${ctx.parsed.y}`, afterLabel: () => '' }
        },
        datalabels: { display: false }
      },
      scales: {
        x: { grid: { color: '#F1F5F9', drawBorder: false }, border: { display: false }, ticks: { font: BASE_FONT, color: '#94A3B8' } },
        y: { min: 0, max: 100, grid: { color: '#F1F5F9', drawBorder: false }, border: { display: false }, ticks: { font: BASE_FONT, color: '#94A3B8', stepSize: 20, callback: (v) => v } }
      }
    }
  });
}

function renderTrendLegend(allData) {
  const container = document.getElementById('trendLegend');
  if (!container) return;
  container.innerHTML = allData.map(d => `
    <div class="trend-legend-item">
      <div class="trend-legend-line" style="background:${d.color}"></div>
      <span>${d.keyword}</span>
    </div>
  `).join('');
}

function getScoreColor(score) {
  if (score >= 70) return '#10B981';
  if (score >= 45) return '#F59E0B';
  return '#EF4444';
}

function destroyAllCharts() {
  if (trendChartInstance) { trendChartInstance.destroy(); trendChartInstance = null; }
  Object.values(genderChartInstances).forEach(c => c.destroy());
  genderChartInstances = {};
  Object.values(ageChartInstances).forEach(c => c.destroy());
  ageChartInstances = {};
}
