/* ====== 共同邏輯（單/多檔可共用）====== */
export const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY = ['新買', '新賣'];
const EXIT_L = ['平賣', '強制平倉'];
const EXIT_S = ['平買', '強制平倉'];

/* 格式化 */
export const fmtInt = (n) => (typeof n === 'number')
  ? n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
  : n ?? '';
export const fmtTs = (s) => `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
export const shortName = (name) => {
  // 取「時間_策略_…」到「_PIVOT…」前的 8~10 碼 + 後綴
  const m = name.match(/^(\d{8,})_([A-Z]+).*?_(PIVOT|.+?)_/i);
  if (m) return `${m[1]}_${m[2]}`;
  return name.replace(/\.[^.]+$/, '').slice(-24);
};

/* 解析單一 TXT */
export function parseOneFile(raw, fileName = '') {
  const rows = raw.trim().split(/\r?\n/);
  if (!rows.length) return null;

  // 若第一行全部是數字（含小數）當參數
  let params = null;
  const first = rows[0].trim();
  if (/^[-\d.+\s]+$/.test(first)) {
    const nums = first.split(/\s+/).map(x => Number(x));
    if (nums.every(v => !Number.isNaN(v))) params = nums;
  }

  const startLine = params ? 1 : 0;

  // 逐行配對交易
  const q = [];
  const trades = [];
  let cum = 0, cumSlip = 0;
  const tsList = [];
  const totalSeq = [], longSeq = [], shortSeq = [], slipSeq = [];
  let cumL = 0, cumS = 0;

  for (let i = startLine; i < rows.length; i++) {
    const line = rows[i].trim();
    if (!line) continue;
    const seg = line.split(/\s+/);
    if (seg.length < 3) continue;

    const [tsRaw, pStr, act] = seg;   // 20230907124000.000000 16593.000000 新賣
    const ts = tsRaw.slice(0, 12);
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
      tsOut: ts, pOut: price,
      pts, fee, tax, gain, gainSlip,
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

/* KPI 集計 */
function sum(arr) { return arr.reduce((a, b) => a + b, 0); }
function byDay(list) {
  const m = {};
  list.forEach(t => { const d = t.tsOut.slice(0,8); m[d] = (m[d] || 0) + t.gain; });
  return Object.values(m);
}
function drawUp(series) { let min = series[0], up = 0; series.forEach(v => { min = Math.min(min, v); up = Math.max(up, v - min); }); return up; }
function drawDn(series) { let peak = series[0], dn = 0; series.forEach(v => { peak = Math.max(peak, v); dn = Math.min(dn, v - peak); }); return dn; }

function makeOneStats(list, series) {
  const wins = list.filter(t => t.gain > 0);
  const loss = list.filter(t => t.gain < 0);
  const count = list.length;
  const totalGain = sum(list.map(t => t.gain));
  const totalLossAbs = Math.abs(sum(loss.map(t => t.gain)));
  const pf = totalLossAbs === 0 ? (wins.length ? 99 : 0) : (totalGain / totalLossAbs);
  return {
    count,
    winRate: (wins.length / (count || 1)) * 100,
    lossRate: (loss.length / (count || 1)) * 100,
    posPts: sum(wins.map(t => t.pts)),
    negPts: sum(loss.map(t => t.pts)),
    totalPts: sum(list.map(t => t.pts)),
    totalGain,
    slipGain: sum(list.map(t => t.gainSlip)),
    bestDay: Math.max(...byDay(list)),
    worstDay: Math.min(...byDay(list)),
    maxUP: drawUp(series),
    maxDD: drawDn(series),
    pf
  };
}

export function buildStats(trades, seq) {
  const L = trades.filter(t => t.side === 'L');
  const S = trades.filter(t => t.side === 'S');
  return {
    all:  makeOneStats(trades, seq.totalSeq),
    long: makeOneStats(L, seq.longSeq),
    short:makeOneStats(S, seq.shortSeq)
  };
}

/* 畫圖資料 */
export function buildChartDatasets(seq) {
  // 產「月份 x 軸」
  const months = [];
  const ym2Date = ym => new Date(+ym.slice(0,4), +ym.slice(4,6) - 1);
  const addM = (d,n) => new Date(d.getFullYear(), d.getMonth()+n);
  const start = addM(ym2Date(seq.tsList[0].slice(0,6)), -1);
  for (let d = start; months.length < 26; d = addM(d,1)) {
    months.push(`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  const mIdx = {}; months.forEach((m,i)=> mIdx[m.replace('/','')] = i);
  const daysInMonth = (y,m)=> new Date(y,m,0).getDate();

  const X = seq.tsList.map(ts => {
    const y = +ts.slice(0,4), m=+ts.slice(4,6), d=+ts.slice(6,8), hh=+ts.slice(8,10), mm=+ts.slice(10,12);
    return mIdx[ts.slice(0,6)] + (d - 1 + (hh + mm / 60) / 24) / daysInMonth(y,m);
  });

  const mkLine = (data, col) => ({ data, label:'', stepped:true, borderColor:col, borderWidth:2,
    pointRadius:2, pointBackgroundColor:col, pointBorderColor:col });

  return {
    labels: X,
    datasets: [
      mkLine(seq.totalSeq, '#fbc02d'),   // 總（黃）
      mkLine(seq.longSeq , '#d32f2f'),   // 多（紅）
      mkLine(seq.shortSeq, '#2e7d32'),   // 空（綠）
      mkLine(seq.slipSeq , '#212121'),   // 滑價（黑）
    ]
  };
}

/* KPI HTML */
export function makeKPIBlocks(stats, seq){
  const block = (title, s) => `
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
    </section>
  `;
  return block('全部', stats.all) + block('多單', stats.long) + block('空單', stats.short);
}

/* 排序（全部累積獲利 高→低） */
export const sortByTotalProfit = (a, b) => (b.stats.all.totalGain - a.stats.all.totalGain);
