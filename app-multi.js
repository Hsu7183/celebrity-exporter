/* ===== 成本與滑價參數 ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const CFG = { feeBothSides:true, taxOnExitOnly:true, slipMode:'total' };
const ENTRY = ['新買','新賣'];
const EXIT_L = ['平賣','強制平倉'];
const EXIT_S = ['平買','強制平倉'];

const filesInput = document.getElementById('filesInput');
const btnClear   = document.getElementById('btn-clear');
const thead      = document.querySelector('#tblBatch thead');
const tbody      = document.querySelector('#tblBatch tbody');
const cvs        = document.getElementById('equityChart');

const paramLineBox = document.getElementById('paramLineMulti');
const kpiBox = document.getElementById('kpiSimpleMulti');
const firstTradeTbl = document.getElementById('tblFirstTrade');
const firstTradeTbody = firstTradeTbl.querySelector('tbody');

let chart;
let rowsData = []; // { filename, params, kpi, sortCache, equitySeq, tsSeq, trades }

/* ===== 選檔 ===== */
filesInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  buildHeader();
  rowsData = [];
  tbody.innerHTML = '';

  for (const f of files) {
    try {
      const text = await readFileWithFallback(f);
      const { params, kpi, equitySeq, tsSeq, trades } = analyse(text);
      rowsData.push({
        filename: f.name, params, kpi, sortCache: buildSortCache(kpi),
        equitySeq, tsSeq, trades
      });
    } catch (err) {
      console.error('解析失敗：', f.name, err);
    }
  }
  renderTable();
  updateFirstDisplay();
});

btnClear.addEventListener('click', () => {
  filesInput.value = '';
  thead.innerHTML = '';
  tbody.innerHTML = '';
  rowsData = [];
  if (chart) chart.destroy();
});

/* ===== 讀檔 ===== */
function readFileWithFallback(file) {
  const read = (enc) => new Promise((ok, no) => {
    const r = new FileReader();
    r.onload  = () => ok(r.result);
    r.onerror = () => no(r.error);
    enc ? r.readAsText(file, enc) : r.readAsText(file);
  });
  return (async () => { try { return await read('big5'); } catch { return await read(); } })();
}

/* ===== 解析 ===== */
function analyse(raw) {
  const rows = (raw || '').trim().split(/\r?\n/).filter(Boolean);
  let params = null, startIdx = 0;
  const firstLineNums = rows[0].trim().split(/\s+/).map(v=>parseFloat(v)).filter(n=>Number.isFinite(n));
  if (firstLineNums.length >= 3) { params = firstLineNums; startIdx = 1; }

  const q = [], tr = [];
  const tsArr = [], tot = [], lon = [], sho = [], sli = [];
  let cum = 0, cumL = 0, cumS = 0, cumSlip = 0;

  for (let i = startIdx; i < rows.length; i++) {
    const parts = rows[i].trim().split(/\s+/);
    if (parts.length < 3) continue;
    const [tsRaw0, pStr, act] = parts;
    const tsRaw = String(tsRaw0).split('.')[0];
    const price = +pStr;
    if (!Number.isFinite(price)) continue;

    if (ENTRY.includes(act)) { q.push({ side: act === '新買' ? 'L' : 'S', pIn: price, tsIn: tsRaw }); continue; }

    const qi = q.findIndex(o =>
      (o.side === 'L' && EXIT_L.includes(act)) ||
      (o.side === 'S' && EXIT_S.includes(act))
    );
    if (qi === -1) continue;

    const pos = q.splice(qi, 1)[0];
    const pts  = pos.side === 'L' ? price - pos.pIn : pos.pIn - price;
    const fee = (CFG.feeBothSides ? FEE * 2 : FEE);
    const tax = TAX ? (CFG.taxOnExitOnly ? Math.round(price * MULT * TAX) : Math.round((pos.pIn + price) * MULT * TAX)) : 0;
    const gain = pts * MULT - fee - tax;
    const slipMoney = (CFG.slipMode === 'half-per-fill') ? (SLIP * MULT * 2) : (SLIP * MULT);
    const gainSlip  = gain - slipMoney;

    cum += gain; cumSlip += gainSlip;
    (pos.side === 'L') ? (cumL += gain) : (cumS += gain);

    tr.push({ pos, tsOut: tsRaw, priceOut: price, pts, gain, gainSlip });

    tsArr.push(tsRaw);
    tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
  }
  const kpi = buildKPI(tr, { tot, lon, sho, sli });
  return { params, kpi, equitySeq:{ tot, lon, sho, sli }, tsSeq: tsArr, trades: tr };
}

/* ===== KPI & 簡略顯示 ===== */
function buildKPI(tr, seq) {
  const sum = a => a.reduce((x,y)=>x+y,0);
  const pct = x => (x*100).toFixed(1)+'%';
  const byDay = list => { const m={}; for (const t of list){ const d=(t.tsOut||'').slice(0,8); m[d]=(m[d]||0)+(t.gain||0);} return Object.values(m); };
  const drawUp = s => { let min=s[0], up=0; for(const v of s){min=Math.min(min,v);up=Math.max(up,v-min);} return up; };
  const drawDn = s => { let pk=s[0], dn=0; for(const v of s){pk=Math.max(pk,v);dn=Math.min(dn,v-pk);} return dn; };

  const longs  = tr.filter(t => t.pos.side==='L');
  const shorts = tr.filter(t => t.pos.side==='S');

  const make = (list, cumSeq) => ({
    '交易數': list.length,
    '勝率': pct(list.filter(t=>t.gain>0).length / (list.length||1)),
    '敗率': pct(list.filter(t=>t.gain<0).length / (list.length||1)),
    '單日最大獲利': Math.max(...byDay(list)),
    '單日最大虧損': Math.min(...byDay(list)),
    '區間最大獲利': drawUp(cumSeq),
    '區間最大回撤': drawDn(cumSeq),
    '累積獲利': sum(list.map(t=>t.gain)),
    '滑價累計獲利': sum(list.map(t=>t.gainSlip))
  });

  return { 全部:make(tr,seq.tot), 多單:make(longs,seq.lon), 空單:make(shorts,seq.sho) };
}

function fmt(n){ return typeof n==='number' ? n.toLocaleString('zh-TW') : n; }
function fmtTs(s){ return `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`; }

/* ===== 表頭 ===== */
function buildHeader(){
  thead.innerHTML = `<tr>
    <th class="sortable" data-key="__filename">檔名/時間</th>
    <th class="sortable" data-key="__params">參數</th>
    ${Object.keys(rowsData[0]?.kpi?.全部 || {}).map(k=>`<th class="sortable" data-key="全部.${k}">全部-${k}</th>`).join('')}
  </tr>`;
  thead.querySelectorAll('th.sortable').forEach(th=>{
    th.addEventListener('click', ()=>{
      const key = th.dataset.key;
      sortRows(key);
      renderTable();
      updateFirstDisplay();
    });
  });
}

/* ===== 排序 ===== */
function sortRows(key){
  rowsData.sort((a,b)=>{
    if (key === '__filename') return a.filename.localeCompare(b.filename);
    if (key === '__params') return (a.params?.join('|')||'').localeCompare(b.params?.join('|')||'');
    const av = a.kpi?.全部?.[key.split('.')[1]] ?? 0;
    const bv = b.kpi?.全部?.[key.split('.')[1]] ?? 0;
    return bv - av;
  });
}

/* ===== 下表渲染 ===== */
function renderTable(){
  tbody.innerHTML = '';
  for (const r of rowsData){
    const tr1 = `<tr><td colspan="2">${r.filename}</td>${Object.values(r.kpi.全部).map(v=>`<td>${fmt(v)}</td>`).join('')}</tr>`;
    const tr2 = `<tr><td colspan="2">${r.params ? r.params.join('｜') : ''}</td>${Object.keys(r.kpi.全部).map(()=>`<td></td>`).join('')}</tr>`;
    tbody.insertAdjacentHTML('beforeend', tr1 + tr2);
  }
}

/* ===== 上半部更新 ===== */
function updateFirstDisplay(){
  const first = rowsData[0];
  if (!first) return;
  // 參數
  paramLineBox.textContent = first.params ? first.params.join('｜') : '';
  // KPI 簡略
  kpiBox.innerHTML = Object.entries(first.kpi).map(([title,obj])=>
    `<div><b>${title}</b>：${Object.entries(obj).map(([k,v])=>`${k} ${fmt(v)}`).join('｜')}</div>`
  ).join('');
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
        <td>${fmtTs(t.pos.tsIn)}</td><td>${t.pos.pIn}</td><td>${t.pos.side==='L'?'新買':'新賣'}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
      </tr>
      <tr>
        <td>${fmtTs(t.tsOut)}</td><td>${t.priceOut}</td><td>${t.pos.side==='L'?'平賣':'平買'}</td>
        <td>${fmt(t.pts)}</td><td>${fmt(FEE*2)}</td><td>${fmt(Math.round(t.priceOut*MULT*TAX))}</td>
        <td>${fmt(t.gain)}</td><td>${fmt(list.slice(0,i+1).reduce((a,b)=>a+b.gain,0))}</td>
        <td>${fmt(t.gainSlip)}</td><td>${fmt(list.slice(0,i+1).reduce((a,b)=>a+b.gainSlip,0))}</td>
      </tr>
    `);
  });
  firstTradeTbl.hidden = false;
}

/* ===== 畫圖 ===== */
function drawChart(tsArr, T, L, S, P){
  if (chart) chart.destroy();
  if (!tsArr?.length) return;
  const X = tsArr.map((ts,i)=>i);
  const mkLine=(d,col)=>({data:d,stepped:true,borderColor:col,borderWidth:2,pointRadius:0});
  chart = new Chart(cvs,{
    type:'line',
    data:{labels:X,datasets:[mkLine(T,'#fbc02d'),mkLine(L,'#d32f2f'),mkLine(S,'#2e7d32'),mkLine(P,'#212121')]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}
  });
}
