const {readAsTextAuto, parseTxt, kpiCompact, drawChart, renderParams, renderKPI, renderDetail, fmt} = SHARED;

const chartCvs = document.getElementById('chart');
const paramLine = document.getElementById('paramLine');
const kpiBox = document.getElementById('kpiCompact');
const detailBody = document.querySelector('#detail tbody');
const sumBody = document.querySelector('#summary tbody');

let items = [];   // {name,time,param,trades,seq,kpi, stat fields...}
let current = -1;

/* 讀檔 */
document.getElementById('files').onchange = async (e)=>{
  const files = Array.from(e.target.files||[]);
  if(!files.length){ alert('未讀到可用檔案'); return; }
  items = []; current = -1;
  sumBody.innerHTML=''; detailBody.innerHTML=''; paramLine.textContent=''; kpiBox.textContent='';
  for (const f of files){
    try{
      const raw = await readAsTextAuto(f);
      const {params,trades,seq} = parseTxt(raw);
      if (!trades.length) continue;
      const kpi = kpiCompact(trades,seq);
      const time = (f.name.match(/\d{8}_\d{6}/)||[''])[0] || f.name;
      items.push({
        file:f, name:f.name, time, params,
        trades, seq, kpi,
        n:kpi.all.n, wr:kpi.all.wr, eq:kpi.all.eq, pf:kpi.all.pf,
        dayMax:kpi.all.dayMax, dd:kpi.all.dd,
        longEq:kpi.long.eq, longWr:kpi.long.wr,
        shortEq:kpi.short.eq, shortWr:kpi.short.wr
      });
    }catch(err){ /* 忽略錯誤檔 */ }
  }
  e.target.value='';
  if (!items.length){ alert('未讀到可用檔案'); return; }
  renderSummary();  // 先畫下方總表
  selectRow(0);     // 預設顯示第一檔
};

document.getElementById('btn-clear').onclick = ()=>{
  items = []; current = -1;
  sumBody.innerHTML=''; detailBody.innerHTML=''; paramLine.textContent=''; kpiBox.textContent='';
  if (window.lineChart) { try{ window.lineChart.destroy(); }catch{} }
};

/* === 下方彙總 === */
function renderSummary(sortKey, asc=true){
  // 排序
  if (sortKey){
    const dir = asc?1:-1;
    items.sort((a,b)=> (a[sortKey]-b[sortKey])*dir || (a.time>b.time?1:-1));
  }
  // 出表
  sumBody.innerHTML='';
  items.forEach((it,idx)=>{
    const row = document.createElement('tr');
    row.dataset.idx = idx;
    row.innerHTML = `
      <td class="sticky">${it.time}</td>
      <td>${(it.params&&it.params.length)? it.params.join('｜') : ''}</td>
      <td>${it.n}</td>
      <td>${it.wr.toFixed(1)}%</td>
      <td>${fmt(it.eq)}</td>
      <td>${it.pf.toFixed(2)}</td>
      <td>${fmt(it.dayMax)}</td>
      <td>${fmt(it.dd)}</td>
      <td>${fmt(it.longEq)}</td>
      <td>${it.longWr.toFixed(1)}%</td>
      <td>${fmt(it.shortEq)}</td>
      <td>${it.shortWr.toFixed(1)}%</td>
    `;
    row.onclick = ()=> selectRow(idx);
    sumBody.appendChild(row);
  });

  // 表頭排序事件（僅綁一次）
  if (!renderSummary.bound){
    const heads = document.querySelectorAll('#summary thead th[data-key]');
    heads.forEach(th=>{
      let asc=true;
      th.addEventListener('click', ()=>{
        renderSummary(th.dataset.key, asc);
        asc = !asc;
      });
    });
    renderSummary.bound = true;
  }
}

/* === 切換上方顯示 === */
function selectRow(i){
  if (i<0 || i>=items.length) return;
  current = i;
  const it = items[i];

  // 標示
  Array.from(sumBody.children).forEach((tr,idx)=>{
    tr.style.outline = idx===i ? '2px solid var(--primary)' : 'none';
  });

  // 右側：參數/KPI/明細
  renderParams(paramLine, it.params||[]);
  renderKPI(kpiBox, it.kpi);
  renderDetail(detailBody, it.trades);

  // 左側：圖
  drawChart(chartCvs, it.seq);
}
