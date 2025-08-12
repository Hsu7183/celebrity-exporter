/* ===== 成本與滑價參數 ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const CFG = { feeBothSides:true, taxOnExitOnly:true, slipMode:'total' };
const ENTRY = ['新買','新賣'];
const EXIT_L = ['平賣','強制平倉'];
const EXIT_S = ['平買','強制平倉'];
const ACTS = new Set([...ENTRY, ...EXIT_L, ...EXIT_S]); // ← 修正：補上動作集合

/* ===== UI ===== */
const filesInput = document.getElementById('filesInput');
const btnClear   = document.getElementById('btn-clear');
const tbl        = document.getElementById('tblBatch');
const thead      = tbl.querySelector('thead');
const tbody      = tbl.querySelector('tbody');
const cvs        = document.getElementById('equityChart');
const paramLineBox = document.getElementById('paramLineMulti');
const kpiBox = document.getElementById('kpiSimpleMulti');
const firstTradeTbl = document.getElementById('tblFirstTrade');
const firstTradeTbody = firstTradeTbl.querySelector('tbody');

let chart;

/* ===== KPI 欄位（簡略版，一致於單檔板） ===== */
const GROUPS = ['全部','多單','空單'];
const KPI_KEYS = ['交易數','勝率','敗率','單日最大獲利','單日最大虧損','區間最大獲利','區間最大回撤','累積獲利','滑價累計獲利'];

/* ===== 狀態 ===== */
let rowsData = []; // { filename, params, kpi, equitySeq, tsSeq, trades }
let currentSortKey = '__filename';
let currentSortDir = 'asc';

/* ===== 事件：選檔 ===== */
filesInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  rowsData = [];
  thead.innerHTML = '';
  tbody.innerHTML = '';
  if (chart) chart.destroy();

  for (const f of files) {
    try {
      const text = await readFileWithFallback(f);
      const { params, kpi, equitySeq, tsSeq, trades } = analyse(text);
      rowsData.push({ filename: f.name, params, kpi, equitySeq, tsSeq, trades });
    } catch (err) {
      console.error('解析失敗：', f.name, err);
    }
  }

  buildHeader();
  sortRows(currentSortKey, currentSortDir);
  renderTable();
  updateFirstDisplay();
});

btnClear.addEventListener('click', () => {
  filesInput.value = '';
  thead.innerHTML = '';
  tbody.innerHTML = '';
  rowsData = [];
  if (chart) chart.destroy();
  paramLineBox.textContent = '';
  kpiBox.innerHTML = '';
  firstTradeTbl.hidden = true;
});

/* ===== 讀檔（big5→utf8 回退） ===== */
function readFileWithFallback(file) {
  const read = (enc) => new Promise((ok, no) => {
    const r = new FileReader();
    r.onload  = () => ok(r.result);
    r.onerror = () => no(r.error);
    enc ? r.readAsText(file, enc) : r.readAsText(file);
  });
  return (async () => { try { return await read('big5'); } catch { return await read(); } })();
}

/* ===== 解析：回傳 參數、KPI、收益序列、交易表 ===== */
function analyse(raw) {
  const rows = (raw || '').split(/\r?\n/).map(s=>s.replace(/\uFEFF/g,'').trim()).filter(Boolean);
  let params = null, startIdx = 0;

  // 第一行若多數為數字 => 視為參數（不納入計算）
  const firstNums = rows[0]?.split(/\s+/).map(v=>parseFloat(v)).filter(n=>Number.isFinite(n)) || [];
  if (firstNums.length >= 3) { params = firstNums; startIdx = 1; }

  const q = [], tr = [];
  const tsArr = [], tot = [], lon = [], sho = [], sli = [];
  let cum = 0, cumL = 0, cumS = 0, cumSlip = 0;

  for (let i=startIdx;i<rows.length;i++){
    const parts = rows[i].split(/\s+/).filter(Boolean);
    if (parts.length < 3) continue;

    const act = parts[parts.length-1];
    const price = parseFloat(parts[1]);
    let tsRaw = parts[0].replace(/\D/g,''); // 留數字
    if (!ACTS.has(act) || !Number.isFinite(price) || tsRaw.length<12) continue;
    tsRaw = tsRaw.slice(0,12); // YYYYMMDDHHMM

    if (ENTRY.includes(act)) { q.push({ side: act==='新買'?'L':'S', pIn: price, tsIn: tsRaw }); continue; }

    const qi = q.findIndex(o => (o.side==='L' && EXIT_L.includes(act)) || (o.side==='S' && EXIT_S.includes(act)));
    if (qi === -1) continue;

    const pos = q.splice(qi,1)[0];
    const pts  = pos.side==='L' ? price - pos.pIn : pos.pIn - price;
    const fee  = CFG.feeBothSides ? FEE*2 : FEE;
    const tax  = TAX ? (CFG.taxOnExitOnly ? Math.round(price*MULT*TAX) : Math.round((pos.pIn+price)*MULT*TAX)) : 0;
    const gain = pts*MULT - fee - tax;
    const slipMoney = (CFG.slipMode==='half-per-fill') ? SLIP*MULT*2 : SLIP*MULT;
    const gainSlip  = gain - slipMoney;

    cum += gain; cumSlip += gainSlip;
    if (pos.side==='L') cumL += gain; else cumS += gain;

    tr.push({ pos, tsOut: tsRaw, priceOut: price, pts, gain, gainSlip });

    tsArr.push(tsRaw);
    tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
  }

  const kpi = buildKPI(tr, { tot, lon, sho, sli });
  return { params, kpi, equitySeq:{ tot, lon, sho, sli }, tsSeq: tsArr, trades: tr };
}

/* ===== KPI 計算（簡略） ===== */
function buildKPI(tr, seq){
  const sum = a => a.reduce((x,y)=>x+y,0);
  const pct = x => (x*100).toFixed(1)+'%';
  const byDay = list => { const m={}; for(const t of list){ const d=t.tsOut.slice(0,8); m[d]=(m[d]||0)+t.gain; } return Object.values(m); };
  const up  = s => { if(!s?.length) return 0; let mn=s[0], v=0; for(const x of s){ mn=Math.min(mn,x); v=Math.max(v,x-mn);} return v; };
  const dn  = s => { if(!s?.length) return 0; let pk=s[0], v=0; for(const x of s){ pk=Math.max(pk,x); v=Math.min(v,x-pk);} return v; };

  const longs  = tr.filter(t=>t.pos.side==='L');
  const shorts = tr.filter(t=>t.pos.side==='S');

  const make = (list, seq) => ({
    '交易數': list.length,
    '勝率': pct(list.filter(t=>t.gain>0).length/(list.length||1)),
    '敗率': pct(list.filter(t=>t.gain<0).length/(list.length||1)),
    '單日最大獲利': Math.max(...byDay(list), 0),
    '單日最大虧損': Math.min(...byDay(list), 0),
    '區間最大獲利': up(seq||[0]),
    '區間最大回撤': dn(seq||[0]),
    '累積獲利': sum(list.map(t=>t.gain)),
    '滑價累計獲利': sum(list.map(t=>t.gainSlip))
  });

  return { 全部:make(tr,seq.tot), 多單:make(longs,seq.lon), 空單:make(shorts,seq.sho) };
}

/* ===== 表頭（含排序切換） ===== */
function buildHeader(){
  const cols = [];
  cols.push('<th class="sortable" data-key="__filename">檔名/時間</th>');
  cols.push('<th class="sortable" data-key="__params">參數</th>');
  for (const g of GROUPS){
    for (const k of KPI_KEYS){
      cols.push(`<th class="sortable" data-key="${g}.${k}">${g}-${k}</th>`);
    }
  }
  thead.innerHTML = `<tr>${cols.join('')}</tr>`;

  thead.querySelectorAll('th.sortable').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key = th.dataset.key;
      if (currentSortKey === key){
        currentSortDir = (currentSortDir === 'asc' ? 'desc' : 'asc');
      } else {
        currentSortKey = key;
        currentSortDir = 'desc'; // KPI 預設降序
      }
      thead.querySelectorAll('th.sortable').forEach(h=>h.classList.remove('asc','desc'));
      th.classList.add(currentSortDir);
      sortRows(currentSortKey, currentSortDir);
      renderTable();
      updateFirstDisplay();
    });
  });
}

/* ===== 排序 ===== */
function parseForSort(v){
  if (v===null || v===undefined) return -Infinity;
  if (typeof v === 'number') return v;
  if (typeof v === 'string'){
    if (v.endsWith('%')) return parseFloat(v);
    return parseFloat(v.replaceAll(',','')) || -Infinity;
  }
  return +v || -Infinity;
}
function sortRows(key, dir='desc'){
  const factor = (dir==='asc'?1:-1);
  rowsData.sort((a,b)=>{
    if (key==='__filename'){
      return a.filename.localeCompare(b.filename) * factor;
    }
    if (key==='__params'){
      const as = a.params ? a.params.join('|') : '';
      const bs = b.params ? b.params.join('|') : '';
      return as.localeCompare(bs) * factor;
    }
    const [g,k] = key.split('.');
    const av = parseForSort(a.kpi?.[g]?.[k]);
    const bv = parseForSort(b.kpi?.[g]?.[k]);
    return (av - bv) * factor || a.filename.localeCompare(b.filename);
  });
}

/* ===== 下表渲染：1行檔名、2行參數、3~5行 KPI(全部/多單/空單) ===== */
function renderTable(){
  tbody.innerHTML = '';
  const blankKpiCols = GROUPS.length * KPI_KEYS.length;

  for (const r of rowsData){
    const range = timeRange(r.tsSeq);
    const row1 = `<tr><td colspan="2">${escapeHTML(r.filename)}<span style="color:#666">（${range}）</span></td>${'<td></td>'.repeat(blankKpiCols)}</tr>`;
    const params = r.params ? r.params.join('｜') : '';
    const row2 = `<tr><td colspan="2">${escapeHTML(params)}</td>${'<td></td>'.repeat(blankKpiCols)}</tr>`;

    const makeKpiRow = (g) => {
      const vals = KPI_KEYS.map(k => fmt(r.kpi?.[g]?.[k]));
      return `<tr><td colspan="2" style="text-align:right;color:#444"><b>${g}</b></td>${vals.map(v=>`<td>${v}</td>`).join('')}</tr>`;
    };

    tbody.insertAdjacentHTML('beforeend', row1 + row2 + makeKpiRow('全部') + makeKpiRow('多單') + makeKpiRow('空單'));
  }
}

/* ===== 上半部顯示：依第一筆 ===== */
function updateFirstDisplay(){
  const first = rowsData[0];
  if (!first){ if(chart) chart.destroy(); paramLineBox.textContent=''; kpiBox.innerHTML=''; firstTradeTbl.hidden=true; return; }

  // 參數
  paramLineBox.textContent = first.params ? first.params.join('｜') : '';

  // KPI 三行（簡略）
  kpiBox.innerHTML = GROUPS.map(g => {
    const obj = first.kpi[g] || {};
    return `<div><b>${g}</b>：${KPI_KEYS.map(k=>`${k} ${fmt(obj[k])}`).join('｜')}</div>`;
  }).join('');

  // 曲線
  drawChart(first.tsSeq, first.equitySeq.tot, first.equitySeq.lon, first.equitySeq.sho, first.equitySeq.sli);

  // 交易表
  renderFirstTradeTable(first.trades);
}

function renderFirstTradeTable(list){
  firstTradeTbody.innerHTML = '';
  list.forEach((t,i)=>{
    firstTradeTbody.insertAdjacentHTML('beforeend', `
      <tr>
        <td rowspan="2">${i+1}</td>
        <td>${fmtTs(t.pos.tsIn)}</td><td>${fmt(t.pos.pIn)}</td><td>${t.pos.side==='L'?'新買':'新賣'}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
      </tr>
      <tr>
        <td>${fmtTs(t.tsOut)}</td><td>${fmt(t.priceOut)}</td><td>${t.pos.side==='L'?'平賣':'平買'}</td>
        <td>${fmt(t.pts)}</td><td>${fmt(FEE*2)}</td><td>${fmt(Math.round(t.priceOut*MULT*TAX))}</td>
        <td>${fmt(t.gain)}</td><td>${fmt(sumUpTo(list,i,'gain'))}</td>
        <td>${fmt(t.gainSlip)}</td><td>${fmt(sumUpTo(list,i,'gainSlip'))}</td>
      </tr>
    `);
  });
  firstTradeTbl.hidden = list.length===0;
}

/* ===== 畫圖（第一筆） ===== */
function drawChart(tsArr, T, L, S, P){
  try{
    if (chart) chart.destroy();
    if (!Array.isArray(tsArr) || tsArr.length===0) return;

    const X = tsArr.map((_,i)=>i);
    const mkLine=(d,col)=>({data:d,stepped:true,borderColor:col,borderWidth:2,pointRadius:0});

    chart = new Chart(cvs,{
      type:'line',
      data:{labels:X,datasets:[
        mkLine(T,'#fbc02d'), mkLine(L,'#d32f2f'), mkLine(S,'#2e7d32'), mkLine(P,'#212121')
      ]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}
    });
  }catch(err){ console.error('畫圖發生錯誤：', err); }
}

/* ===== 小工具 ===== */
function fmt(n){ return (typeof n==='number' && isFinite(n)) ? n.toLocaleString('zh-TW') : (n ?? '—'); }
function fmtTs(s){ return `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`; }
function sumUpTo(arr, idx, key){return arr.slice(0, idx + 1).reduce((a,b)=>a + b[key], 0);}
function escapeHTML(s=''){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function timeRange(tsSeq){
  if(!Array.isArray(tsSeq) || tsSeq.length===0) return '';
  const a = tsSeq[0].slice(0,8), b = tsSeq[tsSeq.length-1].slice(0,8);
  const f = d => `${d.slice(0,4)}/${d.slice(4,6)}/${d.slice(6,8)}`;
  return `${f(a)} ~ ${f(b)}`;
}
