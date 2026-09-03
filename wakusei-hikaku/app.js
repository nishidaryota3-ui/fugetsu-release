// 惑星配置ひかく - メインスレッド
// ワーカーへ基準日を渡し、結果（トップ10）を太陽系図と共に描画する。

const PLANET_COLORS = {
  '水星': '#9c9c9c',
  '金星': '#e0c07a',
  '地球': '#4f8fd1',
  '火星': '#c1573a',
  '木星': '#d6a15c',
  '土星': '#e3cf9a',
  '天王星': '#8fd3d6',
  '海王星': '#4a6fdc',
};

const statusEl = document.getElementById('status-line');
const searchBtn = document.getElementById('btn-search');
const targetSection = document.getElementById('target-section');
const targetLabelEl = document.getElementById('target-date-label');
const targetDiagramEl = document.getElementById('target-diagram');
const resultsSection = document.getElementById('results-section');
const resultsListEl = document.getElementById('results-list');

let meta = null;
let ready = false;

const worker = new Worker('worker.js');

worker.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'ready') {
    meta = msg.meta;
    ready = true;
    searchBtn.disabled = false;
    setStatus(`準備完了（対応範囲：${formatDate(meta.startYear, meta.startMonth, meta.startDay)} 〜 ${formatDate(meta.endYear, meta.endMonth, meta.endDay)}）`);
  } else if (msg.type === 'error') {
    setStatus(msg.message, true);
    searchBtn.disabled = false;
    searchBtn.textContent = 'さがす';
  } else if (msg.type === 'result') {
    renderResult(msg.target, msg.results);
    if (msg.results.length === 0) {
      setStatus('この条件（最短間隔）では候補が見つかりませんでした。間隔を短くするか、対応範囲の端に近い日付を避けてください。', true);
    } else {
      setStatus('');
    }
    searchBtn.disabled = false;
    searchBtn.textContent = 'さがす';
  }
};

worker.onerror = (err) => {
  setStatus('ワーカーでエラーが発生しました: ' + err.message, true);
  searchBtn.disabled = false;
  searchBtn.textContent = 'さがす';
};

function setStatus(text, isError) {
  statusEl.textContent = text || '';
  statusEl.classList.toggle('is-error', !!isError);
}

function formatDate(year, month, day) {
  if (year <= 0) {
    const bcYear = 1 - year;
    return `紀元前${bcYear}年${month}月${day}日`;
  }
  return `西暦${year}年${month}月${day}日`;
}

// 太陽中心の簡易太陽系図をSVGで描画する。
// longitudes: meta.bodies の並びに対応する黄経配列（度）
function buildSolarSystemSVG(longitudes, size) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - size * 0.09;
  const minR = size * 0.14;
  const n = meta.bodies.length;
  const dotR = Math.max(2.2, size * 0.018);

  let svg = `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<circle cx="${cx}" cy="${cy}" r="${size * 0.045}" fill="var(--ph-sun, #d99a3a)" />`;

  for (let b = 0; b < n; b++) {
    const r = minR + (maxR - minR) * (b / (n - 1));
    svg += `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" fill="none" stroke="var(--ph-line, #e3ddd0)" stroke-width="1" />`;
  }

  for (let b = 0; b < n; b++) {
    const r = minR + (maxR - minR) * (b / (n - 1));
    const theta = (longitudes[b] * Math.PI) / 180;
    const x = cx + r * Math.cos(theta);
    const y = cy - r * Math.sin(theta);
    const name = meta.bodies[b];
    const color = PLANET_COLORS[name] || '#888';
    svg += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${dotR}" fill="${color}" stroke="var(--ph-card,#fff)" stroke-width="0.8" />`;
  }

  svg += '</svg>';
  return svg;
}

function renderResult(target, results) {
  const label = formatDate(target.date.year, target.date.month, target.date.day);
  targetLabelEl.textContent = label;
  targetDiagramEl.innerHTML = buildSolarSystemSVG(target.longitudes, 340);
  targetSection.classList.remove('hidden');

  resultsListEl.innerHTML = '';
  results.forEach((r, i) => {
    const li = document.createElement('li');
    li.className = 'ph-result-item';
    const dateLabel = formatDate(r.date.year, r.date.month, r.date.day);
    const pct = r.similarity.toFixed(1);
    li.innerHTML = `
      <div class="ph-rank">${i + 1}</div>
      <div class="ph-result-diagram">${buildSolarSystemSVG(r.longitudes, 84)}</div>
      <div class="ph-result-info">
        <div class="ph-result-date">${dateLabel}</div>
        <div class="ph-result-pct">近似率 ${pct}%</div>
      </div>
    `;
    resultsListEl.appendChild(li);
  });
  resultsSection.classList.remove('hidden');
}

function runSearch() {
  if (!ready) return;
  const year = parseInt(document.getElementById('in-year').value, 10);
  const month = parseInt(document.getElementById('in-month').value, 10);
  const day = parseInt(document.getElementById('in-day').value, 10);
  const minGapYears = parseInt(document.getElementById('in-min-gap').value, 10);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)
      || month < 1 || month > 12 || day < 1 || day > 31) {
    setStatus('日付を正しく入力してください', true);
    return;
  }

  searchBtn.disabled = true;
  searchBtn.textContent = '計算中…';
  setStatus('計算中…（数百ミリ秒〜数秒かかることがあります）');
  worker.postMessage({ type: 'search', year, month, day, minGapYears });
}

searchBtn.disabled = true;
searchBtn.addEventListener('click', runSearch);

setStatus('惑星配置データを読み込み中…');
worker.postMessage({
  type: 'init',
  metaUrl: 'data/meta.json',
  binUrl: 'data/longitudes.bin',
});
