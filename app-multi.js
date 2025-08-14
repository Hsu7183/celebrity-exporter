/* ========= 單檔/多檔共用邏輯（整合版，無需 import） ========= */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY = ['新買', '新賣'];
const EXIT_L = ['平賣', '強制平倉'];
const EXIT_S = ['平買', '強制平倉'];

/* ===== 小工具 ===== */
const fmtInt = (n) => (typeof n === 'number')
  ? n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
  : (n ?? '');
const fmtTs  = (s) => `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
const shortName = (name) => {
  const m = name.match(/^(\d{8,})_([A-Z]+).*?_(PIVOT|.+?)_/i);
  if (m) return `${m[1]}_${m[2]}`;
  return name.replace(/\.[^.]+$/, '').slice(-24);
};

/* 讀檔（Big5 -> UTF-8 fallback） */
function readFileText(file) {
  return new Promise((resolve) => {
    const tryReader = (enc, next) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => next && next();
      if (enc) r.readAsText(file, enc); else r.readAsText(file);
    };
    tryReader('big5', () => tryReader());
  });
}

/* 解析一個 TXT */
function parseOneFile(raw, fileName = '') {
  const rows = raw.trim().split(/\r?\n/);
  if (!rows.length) return null;

  let params = null;
  const first = rows[0].trim();
  if (/^[-\d.+\s]+$/.test(first)) {
    const nums = first.split(/\s+/).map(Number);
    if (nums.every(v => !Number.isNaN(v))) params = nums;
  }
  const startLine = params ? 1 : 0;

  const q = [];
  const trades = [];
  let cum = 0, cumSlip = 0, cumL = 0, cumS = 0;
  const tsList=[], totalSeq=[], longSeq=[], shortSeq=[], slipSeq=[];

  for (let i = startLine; i < rows.length; i++) {
    const line = rows[i].trim(); if (!line) continue;
    const seg = line.split(/\s+/);
    if (seg.length < 3) continue;

    const [tsRaw, pStr, act] = seg;
    const ts = tsRaw.slice(0,12);
    const price = Math.round(Number(pStr));
    if (!act) continue;

    if (ENTRY.includes(act)) {
      q.push({ side: act === '新買' ? 'L' : 'S', pIn: price, tsIn: ts });
      continue;
    }
    const idx = q.findIndex(o =>
      (o.side === 'L' && EXIT_L.includes(act)) ||
      (o.side === 'S' && EXIT_S.includes(act))
    );
    if (idx === -1) continue;

    const pos = q.splice(idx, 1)[0];
    const pts = pos.side === 'L' ? price - pos.pIn : pos.pIn - price;
    const fee = FEE * 2;
    const tax = Math.round(price * MULT * TAX);
    const gain = pts * MULT - fee - tax;
    const gainSlip = gain - SLIP * MULT;

    cum += gain; cumSlip += gainSlip;
    if (pos.side === 'L') cumL += gain; else cumS += gain;

    trades.push({
      side: pos.side, tsIn: pos.tsIn, pIn: pos.pIn,
      tsOut: ts, pOut: price, pts, fee, tax, gain, gainSlip,
      cum, cumSlip
    });

    tsList.push(ts);
    totalSeq.push(cum);
    longSeq.push(cumL);
    shortSeq.push(cumS);
    slipSeq.push(cumSlip);
  }

  if (!trades.length) return null;

  const seq = { tsList, totalSeq, longSeq, shortSeq, slipSeq };
  const stats = buildStats(trades, seq);
  return { fileName, params, trades, seq, stats };
}

/* KPI */
function sum(arr){return arr.reduce((a,b)=>a+b,0);}
function byDay(list){
  const m={}; list.forEach(t=>{const d=t.tsOut.slice(0,8); m[d]=(m[d]||0)+t.gain;});
  return Object.values(m);
}
function up(series){let min=series[0],u=0;series.forEach(v=>{min=Math.min(min,v);u=Math.max(u,v-min);});return u;}
function dd(series){let peak=series[0],d=0;series.forEach(v=>{peak=Math.max(peak,v);d=Math.min(d,v-peak);});return d;}

function makeOneStats(list, series){
  const wins=list.filter(t=>t.gain>0), loss=list.filter(t=>t.gain<0);
  const totalGain = sum(list.map(t=>t.gain));
  const lossAbs   = Math.abs(sum(loss.map(t=>t.gain)));
  const pf = lossAbs===0 ? (wins.length?99:0) : totalGain/lossAbs;
  return {
    count:list.length,
    winRate:(wins.length/(list.length||1))*100,
    lossRate:(loss.length/(list.length||1))*100,
    posPts:sum(wins.map(t=>t.pts)),
    negPts:sum(loss.map(t=>t.pts)),
    totalPts:sum(list.map(t=>t.pts)),
    totalGain,
    slipGain:sum(list.map(t=>t.gainSlip)),
    bestDay:Math.max(...byDay(list)),
    worstDay:Math.min(...byDay(list)),
    maxUP:up(series),
    maxDD:dd(series),
    pf
  };
}
function buildStats(trades, seq){
  const L = trades.filter(t=>t.side==='L');
  const S = trades.filter(t=>t.side==='S');
  return { all:makeOneStats(trades, seq.totalSeq),
           long:makeOneStats(L, seq.longSeq),
           short:makeOneStats(S, seq.shortSeq) };
}

/* 畫圖資料 */
function buildChartDatasets(seq){
  const months=[]; const ym2Date=ym=>new Date(+ym.slice(0,4),+ym.slice(4,6)-1);
  const addM=(d,n)=>new Date(d.getFullYear(),d.getMonth()+n);
  const start=addM(ym2Date(seq.tsList[0].slice(0,6)),-1);
  for(let d=start;months.length<26;d=addM(d,1))
    months.push(`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`);
  const mIdx={}; months.forEach((m,i)=>mIdx[m.replace('/','')]=i);
  const daysInMonth=(y,m)=>new Date(y,m,0).getDate();

  const X = seq.tsList.map(ts=>{
    const y=+ts.slice(0,4),m=+ts.slice(4,6),d=+ts.slice(6,8),hh=+ts.slice(8,10),mm=+ts.slice(10,12);
    return mIdx[ts.slice(0,6)] + (d-1 + (hh+mm/60)/24)/daysInMonth(y,m);
  });

  const mk=(data,col)=>({data,stepped:true,borderColor:col,borderWidth:2,
    pointRadius:2,pointBackgroundColor:col,pointBorderColor:col});
  return { labels:X, datasets:[
    mk(seq.totalSeq,'#fbc02d'),
    mk(seq.longSeq ,'#d32f2f'),
    mk(seq.shortSeq,'#2e7d32'),
    mk(seq.slipSeq ,'#212121')
  ]};
}

/* KPI HTML */
function makeKPIBlocks(stats){
  const block=(title,s)=>`
    <section class="kpi-block">
      <h3>${title}</h3>
      <div class="kpi-grid">
        <div>交易數：<b>${fmtInt(s.count)}</b></div>
        <div>勝率：<b>${s.winRate.toFixed(1)}%</b></div>
        <div>敗率：<b>${s.lossRate.toFixed(1)}%</b></div>
        <div>正點數：<b>${fmtInt(s.posPts)}</b></div>
        <div>負點數：<b>${fmtInt(s.negPts)}</b></div>
        <div>總點數：<b>${fmtInt(s.totalPts)}</b></div>
        <div>累積獲利：<b>${fmtInt(s.totalGain)}</b></div>
        <div>滑價累計獲利：<b>${fmtInt(s.slipGain)}</b></div>
        <div>單日最大獲利：<b>${fmtInt(s.bestDay)}</b></div>
        <div>單日最大虧損：<b>${fmtInt(s.worstDay)}</b></div>
        <div>區間最大獲利：<b>${fmtInt(s.maxUP)}</b></div>
        <div>區間最大回撤：<b>${fmtInt(s.maxDD)}</b></div>
        <div>Profit Factor：<b>${s.pf.toFixed(2)}</b></div>
      </div>
    </section>`;
  return block('全部',stats.all)+block('多單',stats.long)+block('空單',stats.short);
}

/* 排序：累積獲利高→低 */
const sortByTotalProfit = (a,b)=> (b.stats.all.totalGain - a.stats.all.totalGain);

/* ========= DOM ========= */
const inp = document.getElementById('files');
const btnClear = document.getElementById('btn-clear');
const pills = document.getElementById('pills');
const tbl = document.getElementById('tbl');
const tbody = tbl.querySelector('tbody');
const list = document.getElementById('summaryList');
const cvs = document.getElementById('equityChart');
const kpiPane = document.getElementById('kpiPane');

let chart;
const destroyChart=()=>{ if(chart){ chart.destroy(); chart=null; } };

function drawChart(seq){
  destroyChart();
  const {labels,datasets}=buildChartDatasets(seq);
  chart = new Chart(cvs,{
    type:'line',
    data:{labels,datasets},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, datalabels:{display:false}},
      scales:{
        x:{type:'linear',min:0,max:25.999,grid:{display:false},ticks:{display:false}},
        y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}
      }
    },
    plugins:[ChartDataLabels]
  });
}

function renderParams(params){
  pills.innerHTML='';
  if(!params || !params.length) return;
  params.forEach(n=>{
    const span=document.createElement('span');
    span.className='pill';
    span.textContent=fmtInt(n);
    pills.appendChild(span);
  });
}

function renderTable(trades){
  tbody.innerHTML='';
  trades.forEach((t,i)=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${i+1}</td>
      <td>${fmtTs(t.tsIn)}</td><td>${fmtInt(t.pIn)}</td>
      <td>${fmtTs(t.tsOut)}</td><td>${fmtInt(t.pOut)}</td>
      <td>${t.side==='L'?'多':'空'}</td>
      <td>${fmtInt(t.pts)}</td><td>${fmtInt(t.fee)}</td><td>${fmtInt(t.tax)}</td>
      <td>${fmtInt(t.gain)}</td><td>${fmtInt(t.cum)}</td>
      <td>${fmtInt(t.gainSlip)}</td><td>${fmtInt(t.cumSlip)}</td>`;
    tbody.appendChild(tr);
  });
}

function renderKPI(stats){
  kpiPane.innerHTML = makeKPIBlocks(stats);
}

let results=[]; // [{fileName, params, trades, seq, stats}...]

function renderSummary(){
  list.innerHTML='';
  results.forEach(r=>{
    const row=document.createElement('div');
    row.className='summary-row';
    row.innerHTML=`
      <span class="col col-name" title="${r.fileName}">${shortName(r.fileName)}</span>
      <span class="col col-params">${(r.params||[]).map(fmtInt).join(' / ')}</span>
      <span class="col">${fmtInt(r.stats.all.count)}</span>
      <span class="col">${r.stats.all.winRate.toFixed(1)}%</span>
      <span class="col">${fmtInt(r.stats.all.totalGain)}</span>
      <span class="col">${r.stats.all.pf.toFixed(2)}</span>
      <span class="col">${fmtInt(r.stats.all.bestDay)}</span>
      <span class="col">${fmtInt(r.stats.all.maxDD)}</span>
    `;
    row.onclick=()=>{
      drawChart(r.seq);
      renderParams(r.params);
      renderKPI(r.stats);
      renderTable(r.trades);
      window.scrollTo({top:0,behavior:'smooth'});
    };
    list.appendChild(row);
  });
}

function showTop(){
  if(!results.length) return;
  results.sort(sortByTotalProfit);
  const top=results[0];
  drawChart(top.seq);
  renderParams(top.params);
  renderKPI(top.stats);
  renderTable(top.trades);
  renderSummary();
}

/* ========= 事件 ========= */
inp.addEventListener('change', async (e)=>{
  const files = Array.from(e.target.files || []);
  if(!files.length) return;

  results=[];
  for(const f of files){
    try{
      const text = await readFileText(f);
      const one = parseOneFile(text, f.name);
      if(one) results.push(one);
    }catch(err){
      console.error('讀檔失敗：', f.name, err);
    }
  }
  if(!results.length){
    alert('沒有成功配對的交易（所有檔案皆無法配對）');
    return;
  }
  showTop();
});

btnClear.addEventListener('click', ()=>{
  inp.value='';
  results=[];
  destroyChart();
  const ctx=cvs.getContext('2d');
  ctx && ctx.clearRect(0,0,cvs.width,cvs.height);
  pills.innerHTML=''; kpiPane.innerHTML=''; tbody.innerHTML=''; list.innerHTML='';
});
