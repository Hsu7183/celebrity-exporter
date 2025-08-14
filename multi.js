/* ===== 共用工具（批量） ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY=['新買','新賣'], EXIT_L=['平賣','強制平倉'], EXIT_S=['平買','強制平倉'];
const $ = s=>document.querySelector(s), $$ = s=>Array.from(document.querySelectorAll(s));
const fmt = n => typeof n==='number' ? n.toLocaleString('zh-TW') : n;
const fmtTs = s=>`${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
const toIntParams = arr => arr.map(x => (Math.round(parseFloat(x))+""));

function parseTxt(raw){
  const rows = raw.trim().split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  let pLine=null,startIdx=0;
  const firstNums = rows[0]?.match(/-?\d+(\.\d+)?/g)||[];
  if(firstNums.length>=12){ pLine = toIntParams(firstNums); startIdx=1; }
  const trades=[];
  for(let i=startIdx;i<rows.length;i++){
    const cols=rows[i].split(/\s+/); if(cols.length<3) continue;
    trades.push({ts:cols[0].replace('.000000',''), price:+cols[1], act:cols[2]});
  }
  return {params:pLine, trades};
}

function pairTrades(list){
  const q=[], paired=[]; let cum=0,cumSlip=0,cL=0,cS=0;
  const TS=[],T=[],L=[],S=[],P=[];
  list.forEach(r=>{
    if(ENTRY.includes(r.act)){ q.push({side:r.act==='新買'?'L':'S', pIn:r.price, tsIn:r.ts}); return; }
    const qi = q.findIndex(o => (o.side==='L'&&EXIT_L.includes(r.act)) || (o.side==='S'&&EXIT_S.includes(r.act)));
    if(qi===-1) return;
    const pos=q.splice(qi,1)[0];
    const pts= pos.side==='L'? r.price-pos.pIn : pos.pIn-r.price;
    const fee=FEE*2, tax=Math.round(r.price*MULT*TAX);
    const gain = pts*MULT - fee - tax, gainSlip=gain - SLIP*MULT;
    cum+=gain; cumSlip+=gainSlip; (pos.side==='L'? (cL+=gain) : (cS+=gain));
    paired.push({pos, tsOut:r.ts, priceOut:r.price, pts, gain, gainSlip});
    TS.push(r.ts); T.push(cum); L.push(cL); S.push(cS); P.push(cumSlip);
  });
  return {paired,TS,T,L,S,P};
}

function compactKPI(list,T){
  const sum=a=>a.reduce((x,y)=>x+y,0);
  const byDay=l=>{const m={}; l.forEach(t=>{const d=t.tsOut.slice(0,8); m[d]=(m[d]||0)+t.gain}); return Object.values(m)}
  const drawUp=s=>{let m=s[0],u=0; s.forEach(v=>{m=Math.min(m,v);u=Math.max(u,v-m)}); return u}
  const drawDn=s=>{let p=s[0],d=0; s.forEach(v=>{p=Math.max(p,v);d=Math.min(d,v-p)}); return d}

  const L=list.filter(t=>t.pos.side==='L'), S=list.filter(t=>t.pos.side==='S');
  const mk=(lst,seq)=>({
    trades:lst.length,
    win: +(lst.filter(t=>t.gain>0).length/(lst.length||1)*100).toFixed(1),
    gain: sum(lst.map(t=>t.gain)),
    best: Math.max(...byDay(lst),0),
    dd: drawDn(seq)
  });

  let c=0, tSeq=[]; list.forEach(x=>{c+=x.gain; tSeq.push(c)});
  let l=0, lSeq=[]; L.forEach(x=>{l+=x.gain; lSeq.push(l)});
  let s=0, sSeq=[]; S.forEach(x=>{s+=x.gain; sSeq.push(s)});

  const all = mk(list,tSeq);
  const lo  = mk(L,lSeq);
  const sh  = mk(S,sSeq);

  // Profit factor 粗估：勝利總額/虧損絕對值總額
  const winSum = list.filter(t=>t.gain>0).reduce((a,b)=>a+b.gain,0);
  const lossAbs= Math.abs(list.filter(t=>t.gain<0).reduce((a,b)=>a+b.gain,0));
  const pf = lossAbs? (winSum/lossAbs):0;

  return {
    trades:all.trades,
    win:all.win,
    gain:all.gain,
    pf:+pf.toFixed(2),
    best:all.best,
    dd:all.dd,
    lwin:lo.win, lgain:lo.gain,
    swin:sh.win, sgain:sh.gain
  };
}

/* ===== 上方視圖 ===== */
let chart;

function drawChart(T,L,S,P){
  if(chart) chart.destroy();
  const labels=T.map((_,i)=>i);
  const mk=(d,c)=>({data:d,stepped:true,borderColor:c,borderWidth:2,pointRadius:3,pointBackgroundColor:c,pointBorderColor:c});
  chart = new Chart($('#mChart'),{
    type:'line',
    data:{labels, datasets:[ mk(T,'#fbbf24'), mk(L,'#ef4444'), mk(S,'#22c55e'), mk(P,'#111827') ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{padding:{left:0,right:6,top:4,bottom:0}},
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>' '+fmt(c.parsed.y)}}},
      scales:{ x:{type:'linear',offset:false,grid:{display:false},ticks:{display:false},min:0,max:labels.length?labels.length-1:0},
               y:{ticks:{callback:v=>fmt(v)}} }
    }
  });
}

function showTop(rec){
  // 右上參數
  $('#mParam').textContent = rec.param.join('｜');
  // 右上 KPI 行
  const k = rec.kpi;
  $('#mKPI').textContent = `全部：交易數 ${k.trades}｜勝率 ${k.win}%｜單日最大獲利 ${fmt(k.best)}｜區間最大回撤 ${fmt(k.dd)}｜累積獲利 ${fmt(k.gain)}｜PF ${k.pf}　｜多單：勝率 ${k.lwin}%｜累積 ${fmt(k.lgain)}　｜空單：勝率 ${k.swin}%｜累積 ${fmt(k.sgain)}`;

  // 右上交易表
  const head = ['筆數','進場時間','進場價','出場時間','出場價','方向','點數','手續費','期交稅','獲利','累積獲利','滑價獲利','累積滑價獲利'];
  const thead = $('#mHead'); thead.innerHTML = head.map(h=>`<th>${h}</th>`).join('');
  const tbody = $('#mTrades tbody'); tbody.innerHTML='';
  let cGain=0, cSlip=0;
  rec.paired.forEach((t,i)=>{
    cGain+=t.gain; cSlip+=t.gainSlip;
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${i+1}</td><td>${fmtTs(t.pos.tsIn)}</td><td>${fmt(t.pos.pIn)}</td>
      <td>${fmtTs(t.tsOut)}</td><td>${fmt(t.priceOut)}</td><td>${t.pos.side==='L'?'多':'空'}</td>
      <td>${fmt(t.pts)}</td><td>${fmt(FEE*2)}</td><td>${fmt(Math.round(t.priceOut*MULT*TAX))}</td>
      <td>${fmt(t.gain)}</td><td>${fmt(cGain)}</td><td>${fmt(t.gainSlip)}</td><td>${fmt(cSlip)}</td>`;
    tbody.appendChild(tr);
  });

  drawChart(rec.T,rec.L,rec.S,rec.P);
}

/* ===== 讀檔、彙總、排序 ===== */
const store = { list:[], sortKey:'name', sortDir:1, activeIndex:0 };

function filenameTime(name){
  // 只取中間的 8~14 位數時間或 yyyy/mm/dd…；若沒有就回傳原名
  const m = name.match(/\d{8}[_-]?\d{6}/) || name.match(/\d{8}/);
  return m ? m[0] : name;
}

function buildSummary(){
  const tbody = $('#sumTbl tbody'); tbody.innerHTML='';
  store.list.forEach((r,i)=>{
    const tr=document.createElement('tr');
    if(i===store.activeIndex) tr.classList.add('is-active');
    tr.dataset.idx=i;
    tr.innerHTML = `
      <td>${r.shortName}</td>
      <td style="white-space:nowrap">${r.param.join('｜')}</td>
      <td>${fmt(r.kpi.trades)}</td>
      <td>${r.kpi.win}%</td>
      <td>${fmt(r.kpi.gain)}</td>
      <td>${r.kpi.pf}</td>
      <td>${fmt(r.kpi.best)}</td>
      <td>${fmt(r.kpi.dd)}</td>
      <td>${r.kpi.lwin}%</td>
      <td>${fmt(r.kpi.lgain)}</td>
      <td>${r.kpi.swin}%</td>
      <td>${fmt(r.kpi.sgain)}</td>`;
    tbody.appendChild(tr);
  });
}

function resort(){
  const k = store.sortKey, d = store.sortDir;
  store.list.sort((a,b)=>{
    const va = k==='name'? a.shortName : (k==='param'? a.param.join('|') : a.kpi[k]);
    const vb = k==='name'? b.shortName : (k==='param'? b.param.join('|') : b.kpi[k]);
    if(va<vb) return -1*d; if(va>vb) return 1*d; return 0;
  });
  buildSummary();
}

$('#sumTbl thead').addEventListener('click',e=>{
  const th = e.target.closest('th'); if(!th) return;
  const key = th.dataset.k; if(!key) return;
  if(store.sortKey===key) store.sortDir*=-1; else {store.sortKey=key; store.sortDir=1;}
  resort();
});

$('#sumTbl tbody').addEventListener('click',e=>{
  const tr = e.target.closest('tr'); if(!tr) return;
  store.activeIndex = +tr.dataset.idx;
  buildSummary();
  showTop(store.list[store.activeIndex]);
});

$('#clearBtn').onclick=()=>{
  store.list=[]; store.activeIndex=0;
  if(chart) chart.destroy();
  $('#mParam').textContent='';
  $('#mKPI').textContent='';
  $('#mTrades tbody').innerHTML='';
  $('#sumTbl tbody').innerHTML='';
};

$('#multiInput').onchange = async e=>{
  const files = Array.from(e.target.files||[]);
  if(!files.length) return;
  store.list=[];

  for(const f of files){
    const text = await f.text();
    const {params,trades} = parseTxt(text);
    const {paired,TS,T,L,S,P} = pairTrades(trades);
    if(!paired.length) continue;

    const kpi = compactKPI(paired,T);
    store.list.push({
      name:f.name,
      shortName: filenameTime(f.name),
      param: params||[],
      paired, TS,T,L,S,P, kpi
    });
  }

  if(!store.list.length){ alert('未讀到可用檔案'); return; }
  resort();                       // 先排序/產生彙總表
  store.activeIndex = 0;
  showTop(store.list[0]);         // 顯示第一檔
};
