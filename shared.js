/* ===== 共同常數 ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY = {'新買':'L','新賣':'S'};
const EXIT_L = {'平賣':1,'強制平倉':1};
const EXIT_S = {'平買':1,'強制平倉':1};

/* ====== 工具 ====== */
const fmt = n => typeof n==='number'
  ? n.toLocaleString('zh-TW',{maximumFractionDigits:2})
  : n;

const fmtTs = s => `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;

function intifyParams(arr){
  // 顯示整數（只取小數點前）
  return arr.map(v=>{
    const n = Number(v);
    if (!Number.isFinite(n)) return v;
    return String(Math.trunc(n));
  });
}

/* ====== 讀檔（自動 big5 → utf8 嘗試） ====== */
function readAsTextAuto(file){
  return new Promise((resolve,reject)=>{
    const fr1 = new FileReader();
    fr1.onload = ()=> {
      const txt = fr1.result || '';
      // 出現 � 視為編碼不對，再用 utf-8 讀一次
      if (txt.includes('\uFFFD')) {
        const fr2 = new FileReader();
        fr2.onload = ()=> resolve(fr2.result||'');
        fr2.onerror = reject;
        fr2.readAsText(file);
      } else resolve(txt);
    };
    fr1.onerror = reject;
    try{ fr1.readAsText(file,'big5'); }catch(e){ fr1.readAsText(file); }
  });
}

/* ====== 解析 TXT ====== */
function parseTxt(raw){
  const lines = (raw||'').trim().split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if (lines.length===0) return {params:null,trades:[],seq:null};

  // 第一行若都是數字與空白則視為參數
  let params=null;
  if (/^[\d\.\s]+$/.test(lines[0])) {
    const a = lines[0].trim().split(/\s+/);
    if (a.length>=8) {
      params = intifyParams(a);
      lines.shift();
    }
  }

  const open=[], trades=[];
  const ts=[], T=[], L=[], S=[], P=[];
  let cum=0,cumL=0,cumS=0,cumSlip=0;

  for (const r of lines){
    const t = r.split(/\s+/);
    if (t.length<3) continue;
    const tsRaw = t[0];
    const price = +t[1];
    const act = t[2];

    if (act in ENTRY){
      open.push({side:ENTRY[act],pIn:price,tsIn:tsRaw});
      continue;
    }
    const idx = open.findIndex(o => (o.side==='L' && EXIT_L[act]) || (o.side==='S' && EXIT_S[act]));
    if (idx===-1) continue;

    const pos = open.splice(idx,1)[0];
    const pts = pos.side==='L' ? price - pos.pIn : pos.pIn - price;
    const fee = FEE*2, tax=Math.round(price*MULT*TAX);
    const gain = pts*MULT - fee - tax;
    const gSlip = gain - SLIP*MULT;

    cum += gain; cumSlip += gSlip;
    if (pos.side==='L') cumL += gain; else cumS += gain;

    trades.push({pos,tsOut:tsRaw,priceOut:price,pts,gain,gainSlip:gSlip});

    ts.push(tsRaw); T.push(cum); L.push(cumL); S.push(cumS); P.push(cumSlip);
  }
  return {params, trades, seq:{ts,T,L,S,P}};
}

/* ====== KPI 計算（精簡輸出用） ====== */
function kpiCompact(trades, seq){
  const sum = a=>a.reduce((x,y)=>x+y,0);
  const byDay = list=>{
    const m={}; list.forEach(t=>{
      const d=t.tsOut.slice(0,8); m[d]=(m[d]||0)+t.gain;
    });
    return Object.values(m);
  };
  const drawUp = s=>{let mn=s[0]??0,up=0; s.forEach(v=>{mn=Math.min(mn,v);up=Math.max(up,v-mn)}); return up;};
  const drawDn = s=>{let pk=s[0]??0,dn=0; s.forEach(v=>{pk=Math.max(pk,v);dn=Math.min(dn,v-pk)}); return dn;};

  const Lst = trades.filter(t=>t.pos.side==='L');
  const Sst = trades.filter(t=>t.pos.side==='S');

  const make = (list,seqLine)=> {
    const win = list.filter(t=>t.gain>0), loss=list.filter(t=>t.gain<0);
    const wr = (win.length/(list.length||1)*100);
    return {
      n:list.length,
      wr: wr,                               // %
      eq: sum(list.map(t=>t.gain)),
      pf: (Math.abs(sum(loss.map(t=>t.gain)))<1e-9)? 0 : (sum(win.map(t=>t.gain))/Math.abs(sum(loss.map(t=>t.gain)))),
      dayMax: Math.max(...byDay(list),0),
      dayMin: Math.min(...byDay(list),0),
      up: drawUp(seqLine||[]),
      dd: drawDn(seqLine||[])
    };
  };

  return {
    all: make(trades, seq?.T||[]),
    long: make(Lst, seq?.L||[]),
    short: make(Sst, seq?.S||[])
  };
}

/* ====== KPI（單行字串） ====== */
function kpiLineText(k){
  const pct = v=>`${(v||0).toFixed(1)}%`;
  return [
    `<span class="tag">全部</span> 交易數 ${k.all.n}｜勝率 ${pct(k.all.wr)}｜敗率 ${pct(100-k.all.wr)}｜單日最大獲利 ${fmt(k.all.dayMax)}｜單日最大虧損 ${fmt(k.all.dayMin)}｜區間最大獲利 ${fmt(k.all.up)}｜區間最大回撤 ${fmt(k.all.dd)}｜累積獲利 ${fmt(k.all.eq)}`,
    `<span class="tag">多單</span> 交易數 ${k.long.n}｜勝率 ${pct(k.long.wr)}｜敗率 ${pct(100-k.long.wr)}｜單日最大獲利 ${fmt(k.long.dayMax)}｜區間最大回撤 ${fmt(k.long.dd)}｜累積獲利 ${fmt(k.long.eq)}`,
    `<span class="tag">空單</span> 交易數 ${k.short.n}｜勝率 ${pct(k.short.wr)}｜敗率 ${pct(100-k.short.wr)}｜單日最大獲利 ${fmt(k.short.dayMax)}｜區間最大回撤 ${fmt(k.short.dd)}｜累積獲利 ${fmt(k.short.eq)}`
  ].join('<br/>');
}

/* ====== 畫圖（含月份底紋、不留白） ====== */
let lineChart=null;
function drawChart(canvas, seq){
  if (!seq || !seq.ts || seq.ts.length===0) { if(lineChart){lineChart.destroy();} return; }

  if (lineChart) lineChart.destroy();

  // 26 個月 + 月份文字
  const ym2Date = ym => new Date(+ym.slice(0,4), +ym.slice(4,6)-1);
  const addM = (d,n)=> new Date(d.getFullYear(), d.getMonth()+n);
  const start = addM(ym2Date(seq.ts[0].slice(0,6)), -1);
  const months=[];
  for(let d=start; months.length<26; d=addM(d,1))
    months.push(`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`);
  const mIdx={}; months.forEach((m,i)=> mIdx[m.replace('/','')]=i);

  const daysInMonth=(y,m)=> new Date(y,m,0).getDate();
  const X = seq.ts.map(s=>{
    const y=+s.slice(0,4), m=+s.slice(4,6), d=+s.slice(6,8),
          hh=+s.slice(8,10), mm=+s.slice(10,12);
    return mIdx[s.slice(0,6)] + (d-1 + (hh + mm/60)/24) / daysInMonth(y,m);
  });

  const maxI = seq.T.indexOf(Math.max(...seq.T));
  const minI = seq.T.indexOf(Math.min(...seq.T));

  const stripe={
    id:'stripe',
    beforeDraw(c){
      const {ctx,chartArea:{left,right,top,bottom}} = c;
      const w = (right-left)/26;
      ctx.save();
      months.forEach((_,i)=>{
        ctx.fillStyle = i%2 ? 'rgba(0,0,0,.04)' : 'transparent';
        ctx.fillRect(left+i*w, top, w, bottom-top);
      });
      ctx.restore();
    }
  };
  const mmLabel={
    id:'mmLabel',
    afterDraw(c){
      const {ctx,chartArea:{left,right,bottom}} = c;
      const w = (right-left)/26;
      ctx.save();
      ctx.font='11px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillStyle='#555';
      months.forEach((m,i)=> ctx.fillText(m, left+w*(i+.5), bottom+8));
      ctx.restore();
    }
  };

  const mkLine=(d,col)=>({data:d,stepped:true,borderColor:col,borderWidth:2,
    pointRadius:3,pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1});
  const mkLast=(d,col)=>({data:d.map((v,i)=>i===d.length-1?v:null),showLine:false,pointRadius:6,
    pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1,
    datalabels:{display:true,anchor:'end',align:'right',offset:6,
      formatter:v=>v?.toLocaleString('zh-TW')??'',color:'#000',clip:false,font:{size:10}}});
  const mkMark=(d,i,col)=>({data:d.map((v,j)=>j===i?v:null),showLine:false,pointRadius:6,
    pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1,
    datalabels:{display:true,anchor:i===maxI?'end':'start',align:i===maxI?'top':'bottom',offset:8,
      formatter:v=>v?.toLocaleString('zh-TW')??'',color:'#000',clip:false,font:{size:10}}});

  const ctx = canvas.getContext('2d');
  lineChart = new Chart(ctx, {
    type:'line',
    data:{
      labels:X,
      datasets:[
        mkLine(seq.T,'#111827'), // 總（黑）
        mkLine(seq.L,'#d32f2f'), // 多（紅）
        mkLine(seq.S,'#2e7d32'), // 空（綠）
        mkLine(seq.P,'#f59e0b'), // 滑價（黃）

        mkLast(seq.T,'#111827'),
        mkLast(seq.P,'#f59e0b'),
        mkMark(seq.T,maxI,'#d32f2f'),
        mkMark(seq.T,minI,'#2e7d32')
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{padding:{bottom:42,right:60,left:0}},
      plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}}, datalabels:{display:false} },
      scales:{
        x:{type:'linear',min:0,max:25.999,grid:{display:false},ticks:{display:false}},
        y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}
      }
    },
    plugins:[stripe,mmLabel,ChartDataLabels]
  });
}

/* ====== 渲染：參數 / KPI / 明細表 ====== */
function renderParams(dom, params){
  dom.innerHTML = params && params.length
    ? intifyParams(params).join('｜')
    : '';
}
function renderKPI(dom, k){
  dom.innerHTML = kpiLineText(k);
}
function renderDetail(tbody, list){
  tbody.innerHTML = '';
  let cum=0,cumSlip=0;
  list.forEach((t,i)=>{
    cum += t.gain; cumSlip += t.gainSlip;
    const dir = t.pos.side==='L'?'多':'空';
    tbody.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${i+1}</td>
        <td>${fmtTs(t.pos.tsIn)}</td><td>${t.pos.pIn}</td><td>${t.pos.side==='L'?'新買':'新賣'}</td>
        <td>${fmtTs(t.tsOut)}</td><td>${t.priceOut}</td><td>${dir}</td>
        <td>${fmt(t.pts)}</td><td>${fmt(FEE*2)}</td><td>${fmt(Math.round(t.priceOut*MULT*TAX))}</td>
        <td>${fmt(t.gain)}</td><td>${fmt(cum)}</td>
        <td>${fmt(t.gainSlip)}</td><td>${fmt(cumSlip)}</td>
      </tr>
    `);
  });
}

/* ====== 導出全域 ====== */
window.SHARED = {
  readAsTextAuto, parseTxt, kpiCompact, drawChart,
  renderParams, renderKPI, renderDetail, fmt, fmtTs
};
