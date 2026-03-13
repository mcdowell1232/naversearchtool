const KEYWORD_COLORS = [
  '#4F46E5','#EC4899','#F59E0B','#10B981',
  '#3B82F6','#EF4444','#8B5CF6','#06B6D4',
  '#F97316','#14B8A6'
];

function generateTrendData(months, seed, pattern) {
  const data = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let base = 50 + seed * 10;
    let seasonMod = Math.sin((d.getMonth() / 12) * Math.PI * 2 + pattern) * 20;
    let noise = (Math.random() - 0.5) * 15;
    let val = Math.max(5, Math.min(100, Math.round(base + seasonMod + noise)));
    data.push({ period: label, ratio: val });
  }
  return data;
}

function generateAgeRatio(dominantAge) {
  const ages = ['10대', '20대', '30대', '40대', '50대', '60대+'];
  const base = [5, 15, 25, 25, 20, 10];
  const result = base.map((v, i) => {
    let adjusted = v + (i === dominantAge ? 20 : -Math.floor(20 / 5));
    return Math.max(1, adjusted);
  });
  const total = result.reduce((a, b) => a + b, 0);
  return result.map((v, i) => ({ label: ages[i], ratio: Math.round((v / total) * 100) }));
}

function generateMockKeywordData(keyword, index) {
  const seed = (keyword.charCodeAt(0) + keyword.length) % 10;
  const rng = (min, max) => Math.floor(min + ((seed * 7 + index * 13 + keyword.length * 3) % (max - min + 1)));
  const rngFloat = (min, max) => Math.round((min + ((seed * 3.14 + index * 2.71) % (max - min))) * 100) / 100;

  const mobileRatio = rng(55, 85);
  const pcRatio = 100 - mobileRatio;
  const mobileSearch = rng(2000, 80000);
  const pcSearch = Math.round(mobileSearch * (pcRatio / mobileRatio));
  const totalSearch = mobileSearch + pcSearch;
  const maleRatio = rng(30, 70);
  const femaleRatio = 100 - maleRatio;
  const dominantAge = rng(0, 5);
  const ageRatio = generateAgeRatio(dominantAge);
  const pcCtr = rngFloat(0.5, 4.5);
  const moCtr = rngFloat(1.0, 6.5);
  const pcClicks = Math.round(pcSearch * (pcCtr / 100));
  const moClicks = Math.round(mobileSearch * (moCtr / 100));
  const compRaw = rng(0, 100);
  const competition = compRaw < 33 ? 'low' : compRaw < 66 ? 'mid' : 'high';
  const competitionLabel = { low: '낮음', mid: '보통', high: '높음' }[competition];

  const allTrendData = {
    pc: generateTrendData(12, seed, index * 0.8),
    mo: generateTrendData(12, seed + 2, index * 0.8 + 0.5),
  };
  allTrendData.all = allTrendData.pc.map((d, i) => ({
    period: d.period,
    ratio: Math.round((d.ratio + allTrendData.mo[i].ratio) / 2)
  }));

  const compScore = { low: 100, mid: 60, high: 30 }[competition];
  const efficiencyScore = Math.round(
    (Math.log10(totalSearch) / 5) * 35 +
    ((pcCtr + moCtr) / 2 / 6) * 35 +
    (compScore / 100) * 30
  );

  return {
    keyword, color: KEYWORD_COLORS[index % KEYWORD_COLORS.length], index,
    totalSearch, pcSearch, mobileSearch, pcRatio, mobileRatio,
    maleRatio, femaleRatio, ageRatio,
    pcCtr, moCtr, pcClicks, moClicks,
    competition, competitionLabel,
    trendData: allTrendData,
    efficiencyScore: Math.min(99, Math.max(10, efficiencyScore)),
    trendDirection: (() => {
      const all = allTrendData.all;
      const last = all[all.length - 1].ratio;
      const prev = all[all.length - 2].ratio;
      if (last > prev + 5) return 'up';
      if (last < prev - 5) return 'down';
      return 'flat';
    })()
  };
}

function generateMockData(keywords) {
  return keywords.map((kw, i) => generateMockKeywordData(kw.trim(), i));
}

function formatNumber(n) {
  if (!n && n !== 0) return '-';
  return n.toLocaleString('ko-KR');
}

function formatPeriodLabel(period, short = false) {
  const [y, m] = period.split('-');
  if (short) return `${parseInt(m)}월`;
  return `${y}.${m}`;
}
