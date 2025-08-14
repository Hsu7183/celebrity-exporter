import {
  parseOneFile,
  fmtInt, fmtTs, buildChartDatasets, makeKPIBlocks,
  sortByTotalProfit, shortName
} from './shared.js';

/* DOM */
const inp = document.getElementById('files');
const btnClear = document.getElementById('btn-clear');
const pills = document.getElementById('pills');
const tbl = document.getElementById('tbl');
const tbody = tbl.querySelector('tbody');
const list = document.getElementById('summaryList');
const cvs = document.getElementById('equityChart');

let chart;
const destroyChart = () => { if (chart) { chart.destroy(); chart = null; } };

/* state */
let results = [];   // [{fileName, params, trades, seq, stats}...]

/* helpers */
const drawChart = (seq) => {
  destroyChart();
  const { labels, datasets } = buildChartDatasets(seq);
  chart = new Chart(cvs, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, datalabels: { display: false }},
      scales: {
        x: { type: 'linear', min: 0, max: 25.999, grid: { display: false }, ticks: { display: false } },
        y: { ticks: { callback: v => v.toLocaleString('zh-TW') } }
      }
    },
    plugins: [ChartDataLabels]
  });
};

const renderParams = (params) => {
  // params: number[] or null
  pills.innerHTML = '';
  if (!params || !params.length) return;
  params.forEach(n => {
    const span = document.createElement('span');
    span.className = 'pill';
    span.textContent = fmtInt(n);
    pills.appendChild(span);
  });
};

const renderTable = (trades) => {
  tbody.innerHTML = '';
  trades.forEach((t, i) => {
    const tr1 = document.createElement('tr');
    tr1.innerHTML = `
      <td rowspan="2">${i + 1}</td>
      <td>${fmtTs(t.tsIn)}</td><td>${fmtInt(t.pIn)}</td>
      <td>${fmtTs(t.tsOut)}</td><td>${fmtInt(t.pOut)}</td>
      <td>${t.side === 'L' ? '多' : '空'}</td>
      <td>${fmtInt(t.pts)}</td>
      <td>${fmtInt(t.fee)}</td>
      <td>${fmtInt(t.tax)}</td>
      <td>${fmtInt(t.gain)}</td>
      <td>${fmtInt(t.cum)}</td>
      <td>${fmtInt(t.gainSlip)}</td>
      <td>${fmtInt(t.cumSlip)}</td>
    `;
    tbody.appendChild(tr1);
  });
};

const renderKPI = (stats, seq) => {
  document.getElementById('kpiPane').innerHTML = makeKPIBlocks(stats, seq);
};

const renderSummary = () => {
  list.innerHTML = '';
  results.forEach(r => {
    const row = document.createElement('div');
    row.className = 'summary-row';
    row.innerHTML = `
      <span class="col col-name" title="${r.fileName}">${shortName(r.fileName)}</span>
      <span class="col col-params">${(r.params||[]).map(fmtInt).join(' / ')}</span>
      <span class="col">${r.stats.all.count}</span>
      <span class="col">${r.stats.all.winRate.toFixed(1)}%</span>
      <span class="col">${fmtInt(r.stats.all.totalGain)}</span>
      <span class="col">${r.stats.all.pf.toFixed(2)}</span>
      <span class="col">${fmtInt(r.stats.all.bestDay)}</span>
      <span class="col">${fmtInt(r.stats.all.maxDD)}</span>
    `;
    row.onclick = () => {
      // 點選切換第一筆
      drawChart(r.seq);
      renderParams(r.params);
      renderKPI(r.stats, r.seq);
      renderTable(r.trades);
    };
    list.appendChild(row);
  });
};

const showTop = () => {
  if (!results.length) return;
  // 以「全部累積獲利」排序
  results.sort(sortByTotalProfit);
  // 第一筆畫圖 + 右側
  const top = results[0];
  drawChart(top.seq);
  renderParams(top.params);
  renderKPI(top.stats, top.seq);
  renderTable(top.trades);
  // 下方精簡列表
  renderSummary();
};

/* main */
inp.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  results = [];
  for (const f of files) {
    const text = await f.text();
    const one = parseOneFile(text, f.name);
    if (one) results.push(one);
  }
  showTop();
});

btnClear.addEventListener('click', () => {
  inp.value = '';
  results = [];
  destroyChart();
  cvs.getContext('2d').clearRect(0,0,cvs.width,cvs.height);
  pills.innerHTML = '';
  document.getElementById('kpiPane').innerHTML = '';
  tbody.innerHTML = '';
  list.innerHTML = '';
});
