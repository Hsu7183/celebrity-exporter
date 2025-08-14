/* ===== 共用設定（單檔）===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY = ['新買','新賣'], EXIT_L=['平賣','強制平倉'], EXIT_S=['平買','強制平倉'];
const $ = s => document.querySelector(s);

const fmt = n => typeof n==='number' ? n.toLocaleString('zh-TW') : n;
const fmtTs = s => `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
const toIntParams = arr => arr.map(x => (Math.round(parseFloat(x))+""));

function parseTxt(raw){
  const rows = raw.trim().split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  let pLine=null,startIdx=0;

  // 判斷首行是否為參數：至少 12 個數字
  const firstNums = rows[0]?.match(/-?\d+(\.\d+)?/g)||[];
  if(firstNums.length>=12){ pLine = toIntParams(firstNums); startIdx=1; }

  const trades = [];
  for(let i=startIdx;i<rows.length;i++){
    const cols = rows[i].split(/\s+/);
    if(cols.length<3) continue;
    const [tsRaw, pStr, act] = cols;
    trades.push({ts:tsRaw.replace('.000000',''), price:+pStr, act});
  }
  return {params:pLine, trades};
}

function pairTrades(list){
  const q=[], paired=[];
  let cum=0,cumSlip=0,cumL=0,cumS=0;
  const T=[],L=[],S=[],P=[], TS=[];

  list.forEach(r=>{
    if(ENTRY.includes(r.act)){
      q.push({side:r.act==='新買'?'L':'S', pIn:r.price, tsIn:r.ts});
      return;
    }
    const qi = q.findIndex(o =>
      (o.side==='L' && EXIT_L.includes(r.act)) ||
      (o.side==='S' && EXIT_S.includes(r.act))
    );
    if(qi===-1) return;
    const pos = q.splice(qi,1)[0];

    const pts = pos.side==='L' ? r.price - pos.pIn : pos.pIn - r.price;
    const fee = FEE*2, tax = Math.round(r.price*MULT*TAX);
    const gain = pts*MULT - fee - tax;
    const gainSlip = gain - SLIP*MULT;

    cum+=gain; cumSlip+=gainSlip;
    (pos.side==='L'? (cumL+=gain):(cumS+=gain));

    paired.push({pos, tsOut:r.ts, priceOut:r.price, pts, gain, gainSlip});
    TS.push(r.ts); T.push(cum); L.push(cumL); S.push(cumS); P.push(cumSlip);
  });
  return {paired, TS, T, L, S, P};
}

function calcKPI(trades){
  const sum = a=>a.reduce((x,y)=>x+y,0);
  const byDay = (list)=>{const m={};list.forEach(t=>{const d=t.tsOut.slice(0,8); m[d]=(m[d]||0)+t.gain;});return Object.values(m)};
  const drawUp = s=>{let min=s[0],up=0; s.forEach(v=>{min=Math.min(min,v); up=Math.max(up, v-min)}); return up;}
  const drawDn = s=>{let peak=s[0],dn=0; s.forEach(v=>{peak=Math.max(peak,v); dn=Math.min(dn, v-peak)}); return dn;}

  const longs=trades.filter(t=>t.pos.side==='L');
  const shorts=trades.filter(t=>t.pos.side==='S');

  const make=(list,cumSeq)=>({
    交易數:list.length,
    勝率: (list.filter(t=>t.gain>0).length/(list.length||1)*100).toFixed(1)+'%',
    敗率: (list.filter(t=>t.gain<0).length/(list.length||1)*100).toFixed(1)+'%',
    單日最大獲利: Math.max(...byDay(list),0),
    單日最大虧損: Math.min(...byDay(list),0),
    區間最大獲利: drawUp(cumSeq),
    區間最大回撤: drawDn(cumSeq),
    累積獲利: sum(list.map(t=>t.gain)),
    滑價累計獲利: sum(list.map(t=>t.gainSlip))
  });

  return { 全部:make(all.TL,all.T), 多單:make(all.LL,all.L), 空單:make(all.SS,all.S) };

  // 為了上面方便，快速重建
  const all={
    TL: trades,
    LL: longs, SS: shorts,
    T: [], L: [], S: []
  };
}

function kpiCompact(all, longs, shorts, T){
  // 顯示成一行（依你圖3樣式）
  const sum=a=>a.reduce((x,y)=>x+y,0);
  const byDay=l=>{const m={}; l.forEach(t=>{const d=t.tsOut.slice(0,8); m[d]=(m[d]||0)+t.gain}); return Object.values(m)}
  const drawUp=s=>{let m=s[0],u=0; s.forEach(v=>{m=Math.min(m,v);u=Math.max(u,v-m)}); return u}
  const drawDn=s=>{let p=s[0],d=0; s.forEach(v=>{p=Math.max(p,v);d=Math.min(d,v-p)}); return d}

  const mk=(list,seq)=>[
    `交易數 ${list.length}`,
    `勝率 ${(list.filter(t=>t.gain>0).length/(list.length||1)*100).toFixed(1)}%`,
    `敗率 ${(list.filter(t=>t.gain<0).length/(list.length||1)*100).toFixed(1)}%`,
    `單日最大獲利 ${fmt(Math.max(...byDay(list),0))}`,
    `單日最大虧損 ${fmt(Math.min(...byDay(list),0))}`,
    `區間最大獲利 ${fmt(drawUp(seq))}`,
    `區間最大回撤 ${fmt(drawDn(seq))}`,
    `累積獲利 ${fmt(sum(list.map(t=>t.gain)))}`
  ].join('｜');

  const Tseq = [];
  let c=0; all.forEach(t=>{c+=t.gain; Tseq.push(c)});
  let cL=0,cS=0, Lseq=[], Sseq=[];
  longs.forEach(t=>{cL+=t.gain; Lseq.push(cL)});
  shorts.forEach(t=>{cS+=t.gain; Sseq.push(cS)});

  return [
    `全部：${mk(all,Tseq)}`,
    `多單：${mk(longs,Lseq)}`,
    `空單：${mk(shorts,Sseq)}`
  ].join('　');
}

/* ===== 互動 ===== */
let chart;

function drawChart(T,L,S,P){
  if(chart) chart.destroy();
  const labels = T.map((_,i)=>i); // 0..n-1，避免左側留白
  const mk=(data,color)=>({data,stepped:true,borderColor:color,borderWidth:2,
    pointRadius:3,pointBackgroundColor:color,pointBorderColor:color});
  chart = new Chart($('#equity'),{
    type:'line',
    data:{labels, datasets:[ mk(T,'#fbbf24'), mk(L,'#ef4444'), mk(S,'#22c55e'), mk(P,'#111827') ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{padding:{left:0,right:6,top:4,bottom:0}},
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>' '+fmt(c.parsed.y)}}},
      scales:{
        x:{type:'linear',offset:false,grid:{display:false},ticks:{display:false},min:0,max:labels.length?labels.length-1:0},
        y:{ticks:{callback:v=>fmt(v)}}
      }
    }
  });
}

function renderParams(params){
  const box = $('#paramLine'); box.innerHTML='';
  if(!params){ return; }
  params.forEach(v=>{
    const b=document.createElement('span');
    b.className='badge'; b.textContent=v; box.appendChild(b);
  });
}

function renderCompactLine(allTrades, T, L, S){
  const longs = allTrades.filter(t=>t.pos.side==='L');
  const shorts= allTrades.filter(t=>t.pos.side==='S');
  $('#kpiLine').textContent = kpiCompact(allTrades,longs,shorts,T);
}

function renderTable(list){
  const tbody = $('#tbl tbody'); tbody.innerHTML='';
  let cGain=0, cSlip=0;
  list.forEach((t,i)=>{
    cGain+=t.gain; cSlip+=t.gainSlip;
    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${fmtTs(t.pos.tsIn)}</td>
      <td>${fmt(t.pos.pIn)}</td>
      <td>${fmtTs(t.tsOut)}</td>
      <td>${fmt(t.priceOut)}</td>
      <td>${t.pos.side==='L'?'多':'空'}</td>
      <td>${fmt(t.pts)}</td>
      <td>${fmt(FEE*2)}</td>
      <td>${fmt(Math.round(t.priceOut*MULT*TAX))}</td>
      <td>${fmt(t.gain)}</td>
      <td>${fmt(cGain)}</td>
      <td>${fmt(t.gainSlip)}</td>
      <td>${fmt(cSlip)}</td>`;
    tbody.appendChild(tr);
  });
}

function analyse(raw){
  const {params,trades} = parseTxt(raw);
  renderParams(params);
  const {paired,TS,T,L,S,P} = pairTrades(trades);
  if(!paired.length){ alert('沒有成功配對的交易'); return; }
  drawChart(T,L,S,P);
  renderCompactLine(paired,T,L,S);
  renderTable(paired);
}

/* 事件 */
$('#btn-clip').onclick = async ()=>{ analyse(await navigator.clipboard.readText()); };
$('#fileInput').onchange = e=>{
  const f=e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = ()=> analyse(r.result);
  r.readAsText(f);
};
