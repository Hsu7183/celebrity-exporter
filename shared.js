<!-- 放在 single.html / multi.html 內的 <body> 結尾前載入 -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script>
/* ---- 唯一全域：SHARED ---- */
(function(){
  const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
  const ENTRY = ['新買','新賣'], EXIT_L = ['平賣','強制平倉'], EXIT_S = ['平買','強制平倉'];

  const fmt = n => typeof n==='number'
      ? n.toLocaleString('zh-TW',{maximumFractionDigits:2})
      : n;
  const fmtTs = s => `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;

  async function readAsTextAuto(file){
    const read = (enc) => new Promise((ok,no)=>{
      const r = new FileReader();
      r.onload = ()=>ok(r.result); r.onerror = ()=>no(r.error);
      enc ? r.readAsText(file,enc) : r.readAsText(file);
    });
    try{ return await read('big5'); }catch{ return await read(); }
  }

  function parseRaw(raw){
    const rows = raw.trim().split(/\r?\n/).filter(Boolean);
    if(!rows.length) return {params:null, lines:[]};
    // 第一行可能是參數（都是數字）
    const tks = rows[0].trim().split(/\s+/);
    let params=null, start=0;
    if(tks.every(x=>/^-?\d+(\.\d+)?$/.test(x))){
      params = tks.map(v=>Math.floor(+v)); // 顯示整數
      start=1;
    }
    const lines = rows.slice(start).map(r=>{
      const [ts,price,act] = r.trim().split(/\s+/);
      return {ts: (ts||'').replace('.000000',''), price:+price, act};
    });
    return {params, lines};
  }

  function pairTrades(lines){
    const q=[], tr=[];
    const tsArr=[], tot=[], lon=[], sho=[], sli=[];
    let cum=0, cumL=0, cumS=0, cumSlip=0;

    for(const row of lines){
      if(!row.act) continue;
      const {ts, price, act} = row;

      if(ENTRY.includes(act)){
        q.push({side: act==='新買'?'L':'S', pIn:price, tsIn:ts});
        continue;
      }

      const qi = q.findIndex(o =>
        (o.side==='L' && EXIT_L.includes(act)) ||
        (o.side==='S' && EXIT_S.includes(act)));
      if(qi===-1) continue;

      const pos = q.splice(qi,1)[0];
      const pts = pos.side==='L' ? price-pos.pIn : pos.pIn-price;
      const fee = FEE*2, tax = Math.round(price*MULT*TAX);
      const gain = pts*MULT - fee - tax;
      const gainSlip = gain - SLIP*MULT;

      cum += gain; cumSlip += gainSlip;
      pos.side==='L' ? cumL+=gain : cumS+=gain;

      tr.push({pos, tsOut:ts, priceOut:price, pts, gain, gainSlip});
      tsArr.push(ts); tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
    }
    return {tr, seq:{tsArr, tot, lon, sho, sli}};
  }

  function statsFrom(tr, seq){
    if(!tr.length) return null;
    const sum = a => a.reduce((x,y)=>x+y,0);
    const byDay = list=>{
      const m={}; list.forEach(t=>{const d=t.tsOut.slice(0,8); m[d]=(m[d]||0)+t.gain;}); return Object.values(m);
    };
    const drawUp = s=>{let mn=s[0], up=0; s.forEach(v=>{mn=Math.min(mn,v); up=Math.max(up,v-mn);}); return up;};
    const drawDn = s=>{let pk=s[0], dn=0; s.forEach(v=>{pk=Math.max(pk,v); dn=Math.min(dn,v-pk);}); return dn;};

    const longs = tr.filter(t=>t.pos.side==='L');
    const shorts= tr.filter(t=>t.pos.side==='S');
    const make = (list, cumSeq)=>({
      count: list.length,
      win:   list.filter(t=>t.gain>0).length,
      lose:  list.filter(t=>t.gain<0).length,
      ptsPos: sum(list.filter(t=>t.gain>0).map(t=>t.pts)),
      ptsNeg: sum(list.filter(t=>t.gain<0).map(t=>t.pts)),
      ptsTot: sum(list.map(t=>t.pts)),
      gain:   sum(list.map(t=>t.gain)),
      gainSlip: sum(list.map(t=>t.gainSlip)),
      dayMax: Math.max(...byDay(list)),
      dayMin: Math.min(...byDay(list)),
      up:  drawUp(cumSeq),
      dd:  drawDn(cumSeq)
    });

    return {
      all: make(tr, seq.tot),
      long: make(longs, seq.lon),
      short: make(shorts, seq.sho)
    };
  }

  function buildTradesTableRows(list){
    const rows = [];
    list.forEach((t,i)=>{
      rows.push([
        i+1, fmtTs(t.pos.tsIn), t.pos.pIn, (t.pos.side==='L'?'新買':'新賣'),
        '—','—','—','—','—','—'
      ]);
      rows.push([
        '', fmtTs(t.tsOut), t.priceOut, (t.pos.side==='L'?'平賣':'平買'),
        fmt(t.pts), fmt(45*2), fmt(Math.round(t.priceOut*MULT*TAX)),
        fmt(t.gain), '', fmt(t.gainSlip), ''
      ]);
    });
    return rows;
  }

  function chartDataFrom(seq){
    // 取 26 個月的 X 軸（與你原始版一致）
    const ym2Date = ym => new Date(+ym.slice(0,4), +ym.slice(4,6)-1);
    const addM = (d,n)=> new Date(d.getFullYear(), d.getMonth()+n);
    const start = addM(ym2Date(seq.tsArr[0].slice(0,6)),-1);
    const months=[]; for(let d=start; months.length<26; d=addM(d,1))
      months.push(`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`);
    const mIdx={}; months.forEach((m,i)=>mIdx[m.replace('/','')]=i);
    const daysInMonth=(y,m)=> new Date(y,m,0).getDate();
    const X = seq.tsArr.map(ts=>{
      const y=+ts.slice(0,4), m=+ts.slice(4,6), d=+ts.slice(6,8), hh=+ts.slice(8,10), mm=+ts.slice(10,12);
      return mIdx[ts.slice(0,6)] + (d-1 + (hh+mm/60)/24)/daysInMonth(y,m);
    });

    const maxI = seq.tot.indexOf(Math.max(...seq.tot));
    const minI = seq.tot.indexOf(Math.min(...seq.tot));

    const label=months, mkLine=(d,col)=>({data:d,stepped:true,borderColor:col,borderWidth:2,
      pointRadius:3,pointBackgroundColor:col,pointBorderColor:col});
    const mkLast=(d,col)=>({data:d.map((v,i)=>i===d.length-1?v:null),showLine:false,pointRadius:6,
      pointBackgroundColor:col,pointBorderColor:col});
    const mkMark=(d,i,col)=>({data:d.map((v,j)=>j===i?v:null),showLine:false,pointRadius:6,
      pointBackgroundColor:col,pointBorderColor:col});

    return {label,X,maxI,minI, mkLine, mkLast, mkMark, months};
  }

  function drawCurve(canvas, seq){
    if(!seq || !seq.tsArr.length) return null;
    const {label,X,maxI,minI,mkLine,mkLast,mkMark,months} = chartDataFrom(seq);

    const stripe={id:'stripe',beforeDraw(c){const{ctx,chartArea:{left,right,top,bottom}}=c,w=(right-left)/26;
      ctx.save();months.forEach((_,i)=>{ctx.fillStyle=i%2?'rgba(0,0,0,.04)':'transparent';
      ctx.fillRect(left+i*w,top,w,bottom-top);});ctx.restore();}};
    const mmLabel={id:'mmLabel',afterDraw(c){const{ctx,chartArea:{left,right,bottom}}=c,w=(right-left)/26;
      ctx.save();ctx.font='11px sans-serif';ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#555';
      months.forEach((m,i)=>ctx.fillText(m,left+w*(i+.5),bottom+8));ctx.restore();}};

    if(canvas.__ch) canvas.__ch.destroy();
    canvas.__ch = new Chart(canvas, {
      type:'line',
      data:{labels:X, datasets:[
        mkLine(seq.tot,'#f59e0b'), mkLine(seq.lon,'#ef4444'),
        mkLine(seq.sho,'#10b981'), mkLine(seq.sli,'#111827'),
        mkLast(seq.tot,'#f59e0b'), mkLast(seq.lon,'#ef4444'),
        mkLast(seq.sho,'#10b981'), mkLast(seq.sli,'#111827'),
        mkMark(seq.tot,maxI,'#ef4444'), mkMark(seq.tot,minI,'#10b981')
      ]},
      options:{
        responsive:true, maintainAspectRatio:false,
        layout:{padding:{bottom:40,right:40,left:0}}, // 左邊不留白
        plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}}},
        scales:{x:{type:'linear',min:0,max:25.999,grid:{display:false},ticks:{display:false}},
                y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}}
      }, plugins:[stripe,mmLabel]
    });
    return canvas.__ch;
  }

  function paramChips(params){
    if(!params) return '';
    return params.join('｜');
  }

  // 暴露
  window.SHARED = {
    readAsTextAuto, parseRaw, pairTrades, statsFrom, buildTradesTableRows,
    drawCurve, fmt, fmtTs, paramChips
  };
})();
</script>
