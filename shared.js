/* ===== 共用：解析 + 計算 + 畫圖（ES Module） ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY = ['新買','新賣'], EXIT_L = ['平賣','強制平倉'], EXIT_S = ['平買','強制平倉'];

const fmtInt = n => (n ?? 0).toLocaleString('zh-TW', {maximumFractionDigits:0});
const fmtPct = v => `${(v*100).toFixed(1)}%`;
const fmtTs  = s => `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;

function parseTxt(raw){
  const rows = raw.trim().split(/\r?\n/);
  if (!rows.length) return null;

  // 參數行（第一行 15 個數，顯示整數）
  const pLine = rows[0].trim();
  const parts = pLine.split(/\s+/).filter(Boolean);
  let params = [];
  if (parts.length >= 10) {
    params = parts.slice(0, 15).map(x => {
      const n = Math.round(+x); return isFinite(n) ? n : x;
    });
  }

  const q = [], tr = [];
  const tsArr = [], tot = [], lon = [], sho = [], sli = [];
  let cum = 0, cumL = 0, cumS = 0, cumSlip = 0;

  rows.slice( params.length?1:0 ).forEach(r=>{
    const [tsRaw, pStr, act] = r.trim().split(/\s+/); if(!act) return;
    const price = +pStr;

    if(ENTRY.includes(act)){
      q.push({side: act==='新買'?'L':'S', pIn: price, tsIn: tsRaw});
      return;
    }
    const qi = q.findIndex(o =>
      (o.side==='L' && EXIT_L.includes(act)) ||
      (o.side==='S' && EXIT_S.includes(act))
    );
    if(qi===-1) return;
    const pos = q.splice(qi,1)[0];

    const pts = pos.side==='L' ? price - pos.pIn : pos.pIn - price;
    const fee = FEE*2, tax = Math.round(price*MULT*TAX);
    const gain = pts*MULT - fee - tax;
    const gainSlip = gain - SLIP*MULT;

    cum += gain; cumSlip += gainSlip;
    pos.side==='L' ? (cumL+=gain) : (cumS+=gain);

    tr.push({pos, tsOut:tsRaw, priceOut:price, pts, gain, gainSlip});

    tsArr.push(tsRaw); tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
  });

  return {params, tr, tsArr, seq:{tot, lon, sho, sli}};
}

function buildKPI(tr, seq){
  const sum = a => a.reduce((x,y)=>x+y,0);
  const byDay = list => {
    const m={}; list.forEach(t=>{const d=t.tsOut.slice(0,8); m[d]=(m[d]||0)+t.gain;}); 
    return Object.values(m);
  };
  const drawUp = s => {let min=s[0]??0, up=0; s.forEach(v=>{min=Math.min(min,v); up=Math.max(up,v-min)}); return up;};
  const drawDn = s => {let peak=s[0]??0, dn=0; s.forEach(v=>{peak=Math.max(peak,v); dn=Math.min(dn,v-peak)}); return dn;};

  const longs  = tr.filter(t=>t.pos.side==='L');
  const shorts = tr.filter(t=>t.pos.side==='S');

  const mk = (list, cum) => {
    const win  = list.filter(t=>t.gain>0), loss=list.filter(t=>t.gain<0);
    return {
      n:list.length,
      winr: list.length? win.length/list.length : 0,
      lossr:list.length? loss.length/list.length: 0,
      gsum: sum(list.map(t=>t.gain)),
      gsumSlip: sum(list.map(t=>t.gainSlip)),
      posPts: sum(win.map(t=>t.pts)),
      negPts: sum(loss.map(t=>t.pts)),
      totPts: sum(list.map(t=>t.pts)),
      dayMax: Math.max(...byDay(list), 0),
      dayMin: Math.min(...byDay(list), 0),
      runUp:  drawUp(cum),
      drawDn: drawDn(cum)
    };
  };

  return { all: mk(tr, seq.tot), L: mk(longs, seq.lon), S: mk(shorts, seq.sho) };
}

function kpiToMiniText(k){
  const row = (t, o) => (
    `<div class="row">
      <b>${t}</b>：交易數 <b>${o.n}</b>｜勝率 <b>${fmtPct(o.winr)}</b>｜敗率 ${fmtPct(o.lossr)}
      ｜單日最大獲利 <b>${fmtInt(o.dayMax)}</b>｜單日最大虧損 ${fmtInt(o.dayMin)}
      ｜區間最大獲利 <b>${fmtInt(o.runUp)}</b>｜區間最大回撤 <b>${fmtInt(o.drawDn)}</b>
      ｜累積獲利 <b>${fmtInt(o.gsum)}</b>｜滑價累計獲利 <b>${fmtInt(o.gsumSlip)}</b>
    </div>`
  );
  return row('全部',k.all)+row('多單',k.L)+row('空單',k.S);
}

let chart;
function drawChart(cvs, tsArr, T, L, S, P){
  if(chart) chart.destroy();

  const ym2Date = ym => new Date(+ym.slice(0,4), +ym.slice(4,6)-1);
  const addM = (d,n)=>new Date(d.getFullYear(), d.getMonth()+n);
  const start = addM(ym2Date(tsArr[0]?.slice(0,6) ?? '202301'), -1);
  const months=[];
  for(let d=start; months.length<26; d=addM(d,1))
    months.push(`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`);
  const mIdx={}; months.forEach((m,i)=>mIdx[m.replace('/','')]=i);
  const daysInMonth=(y,m)=>new Date(y,m,0).getDate();
  const X = tsArr.map(ts=>{
    const y=+ts.slice(0,4), m=+ts.slice(4,6), d=+ts.slice(6,8),
          hh=+ts.slice(8,10), mm=+ts.slice(10,12);
    return (mIdx[ts.slice(0,6)] ?? 0) + (d-1 + (hh+mm/60)/24)/daysInMonth(y,m);
  });

  const stripe={id:'stripe',beforeDraw(c){const{ctx,chartArea:{left,right,top,bottom}}=c,w=(right-left)/26;
    ctx.save();months.forEach((_,i)=>{ctx.fillStyle=i%2?'rgba(0,0,0,.05)':'transparent';
    ctx.fillRect(left+i*w,top,w,bottom-top)});ctx.restore();}};
  const mmLabel={id:'mmLabel',afterDraw(c){const{ctx,chartArea:{left,right,bottom}}=c,w=(right-left)/26;
    ctx.save();ctx.font='11px sans-serif';ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#555';
    months.forEach((m,i)=>ctx.fillText(m,left+w*(i+.5),bottom+8));ctx.restore();}};

  const mkLine=(d,col)=>({data:d,stepped:true,borderColor:col,borderWidth:2,
    pointRadius:3,pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1});

  chart = new Chart(cvs, {
    type:'line',
    data:{
      labels:X,
      datasets:[
        mkLine(T,'#111827'),  // 總(黑)
        mkLine(L,'#d32f2f'),  // 多(紅)
        mkLine(S,'#2e7d32'),  // 空(綠)
        mkLine(P,'#f59e0b'),  // 滑價累計(黃)
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{padding:{bottom:42,right:8,left:8,top:4}},
      plugins:{
        legend:{display:false},tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}},
        datalabels:{display:false}
      },
      scales:{x:{type:'linear',min:0,max:25.999,grid:{display:false},ticks:{display:false}},
              y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}}
    },
    plugins:[stripe,mmLabel,ChartDataLabels]
  });
}

async function readAsText(file){
  const read = enc => new Promise((ok,no)=>{
    const r=new FileReader(); r.onload=()=>ok(r.result); r.onerror=()=>no(r.error);
    enc ? r.readAsText(file, enc) : r.readAsText(file);
  });
  try{ return await read('big5'); }catch{ return await read(); }
}

function trimName(name){
  return name.replace(/\.[^.]+$/,'').split(/[\\/]/).pop();
}

export { parseTxt, buildKPI, kpiToMiniText, drawChart, fmtInt, fmtPct, fmtTs, readAsText, trimName };
