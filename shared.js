<script defer src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0"></script>
<script>
/* global Chart, ChartDataLabels */
(function () {
  const CONST = { MULT:200, FEE:45, TAX:0.00004, SLIP:1.5 };
  const ENTRY = ['新買','新賣'];
  const EXITL = ['平賣','強制平倉'];
  const EXITS = ['平買','強制平倉'];

  const fmtInt = n => Number(n).toLocaleString('zh-TW', {maximumFractionDigits:0});
  const fmt = n => typeof n === 'number'
      ? n.toLocaleString('zh-TW', {maximumFractionDigits:2}) : n;
  const fmtTs = s => `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;

  /** 讀檔：big5 失敗時改 utf-8 */
  function readAsTextAuto(file){
    return new Promise((resolve,reject)=>{
      const r1 = new FileReader();
      r1.onload = () => resolve(r1.result);
      r1.onerror = () => {
        const r2 = new FileReader();
        r2.onload = () => resolve(r2.result);
        r2.onerror = reject;
        r2.readAsText(file);
      };
      // 先試 big5
      try{ r1.readAsText(file, 'big5'); }catch{ r1.readAsText(file); }
    });
  }

  /** 解析 TXT：回 {params, paramsLine, trades[]} */
  function parseRaw(raw){
    const rows = raw.trim().split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    let params = [];
    // 第一行若是純數字組成視為參數列
    const firstNums = rows[0].split(/\s+/).every(x => !isNaN(Number(x)));
    if (firstNums) {
      params = rows[0].split(/\s+/).map(Number);
      rows.shift();
    }
    const trades = rows.map(l=>{
      const [ts, price, act] = l.split(/\s+/);
      return {ts, price:+price, act};
    });
    const paramsLine = params.length
      ? params.map(v => fmtInt(v)).join('｜')
      : '';
    return { params, paramsLine, trades };
  }

  /** 配對/績效 */
  function analyseTrades(trades){
    const q = [];
    const rs = [];
    const Xts=[], tot=[], lon=[], sho=[], slip=[];
    let cum=0, cumL=0, cumS=0, cumSlip=0;

    for(const t of trades){
      if(ENTRY.includes(t.act)){
        q.push({ side: t.act==='新買'?'L':'S', pIn:t.price, tsIn:t.ts });
        continue;
      }
      const qi = q.findIndex(o => (o.side==='L' && EXITL.includes(t.act)) || (o.side==='S' && EXITS.includes(t.act)));
      if (qi === -1) continue;
      const pos = q.splice(qi,1)[0];

      const pts = pos.side==='L' ? (t.price - pos.pIn) : (pos.pIn - t.price);
      const fee = CONST.FEE * 2;
      const tax = Math.round(t.price * CONST.MULT * CONST.TAX);
      const gain = pts * CONST.MULT - fee - tax;
      const gainSlip = gain - CONST.SLIP * CONST.MULT;

      cum += gain; cumSlip += gainSlip;
      pos.side==='L' ? (cumL += gain) : (cumS += gain);

      rs.push({pos, tsOut:t.ts, priceOut:t.price, pts, gain, gainSlip});

      Xts.push(t.ts); tot.push(cum); lon.push(cumL); sho.push(cumS); slip.push(cumSlip);
    }
    return { list:rs, seq:{ts:Xts, T:tot, L:lon, S:sho, P:slip} };
  }

  /** KPI（回文字 + 給表格的物件） */
  function buildKPI(list, seq){
    const sum = a => a.reduce((x,y)=>x+y,0);
    const byDay = a=>{
      const m={};
      a.forEach(t=>{ const d=t.tsOut.slice(0,8); m[d]=(m[d]||0)+t.gain; });
      return Object.values(m);
    };
    const rise = s=>{ let m=s[0],u=0; s.forEach(v=>{m=Math.min(m,v); u=Math.max(u,v-m);}); return u; };
    const fall = s=>{ let p=s[0],d=0; s.forEach(v=>{p=Math.max(p,v); d=Math.min(d,v-p);}); return d; };

    const mk = (filter, seqArr)=>{
      const li = list.filter(filter);
      const win = li.filter(t=>t.gain>0);
      const loss= li.filter(t=>t.gain<0);
      const pf = (sum(win.map(t=>t.gain)) / Math.abs(sum(loss.map(t=>t.gain||0)))) || 0;

      const txt = `交易數 ${li.length}｜勝率 ${(win.length/(li.length||1)*100).toFixed(1)}%｜敗率 ${(loss.length/(li.length||1)*100).toFixed(1)}%｜單日最大獲利 ${fmtInt(Math.max(...byDay(li),0))}｜單日最大虧損 ${fmtInt(Math.min(...byDay(li),0))}｜區間最大獲利 ${fmtInt(rise(seqArr))}｜區間最大回撤 ${fmtInt(fall(seqArr))}｜累積獲利 ${fmtInt(sum(li.map(t=>t.gain)))}｜滑價累計獲利 ${fmtInt(sum(li.map(t=>t.gainSlip)))}｜ProfitFactor：${pf.toFixed(2)}`;
      const row = {
        trades: li.length,
        winRate: +(win.length/(li.length||1)*100).toFixed(1),
        profit: sum(li.map(t=>t.gain)),
        pf:+pf.toFixed(2),
        dayMax: Math.max(...byDay(li),0),
        dd: fall(seqArr),
      };
      return { txt, row };
    };

    const all  = mk(()=>true, seq.T);
    const long = mk(t=>t.pos.side==='L', seq.L);
    const shrt = mk(t=>t.pos.side==='S', seq.S);

    return { all, long, shrt };
  }

  /** 繪圖（左邊不留白） */
  function drawCurve(canvas, seq){
    if (!canvas) return;
    if (canvas.__chart) { canvas.__chart.destroy(); canvas.__chart = null; }
    const X = seq.ts.map((_,i)=>i); // left-aligned index
    const mk = (d,c)=>({data:d,stepped:true,borderColor:c,borderWidth:2,pointRadius:3,
      pointBackgroundColor:c,pointBorderColor:c,fill:false});
    const chart = new Chart(canvas, {
      type:'line',
      data:{
        labels:X,
        datasets:[
          mk(seq.T,'#111827'),
          mk(seq.L,'#ef4444'),
          mk(seq.S,'#16a34a'),
          mk(seq.P,'#f59e0b'),
        ]
      },
      options:{
        maintainAspectRatio:false,
        responsive:true,
        plugins:{legend:{display:false}, datalabels:{display:false}},
        scales:{x:{grid:{display:false}}, y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}}
      },
      plugins:[ChartDataLabels]
    });
    canvas.__chart = chart;
  }

  /** 交易表渲染 */
  function renderTradeTable(tbody, list){
    tbody.innerHTML = '';
    list.forEach((t,i)=>{
      const tr1 = document.createElement('tr');
      tr1.innerHTML = `
        <td rowspan="2">${i+1}</td>
        <td>${fmtTs(t.pos.tsIn)}</td>
        <td>${t.pos.pIn}</td>
        <td>${t.pos.side==='L'?'新買':'新賣'}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>`;
      const tr2 = document.createElement('tr');
      tr2.innerHTML = `
        <td>${fmtTs(t.tsOut)}</td>
        <td>${t.priceOut}</td>
        <td>${t.pos.side==='L'?'平賣':'平買'}</td>
        <td>${fmt(t.pts)}</td>
        <td>${fmt(CONST.FEE*2)}</td>
        <td>${fmt(Math.round(t.priceOut*CONST.MULT*CONST.TAX))}</td>
        <td>${fmt(t.gain)}</td>
        <td>${fmt(sumUpTo(list,i,'gain'))}</td>
        <td>${fmt(t.gainSlip)}</td>
        <td>${fmt(sumUpTo(list,i,'gainSlip'))}</td>`;
      tbody.appendChild(tr1); tbody.appendChild(tr2);
    });
  }

  function sumUpTo(arr, idx, key){
    let s=0; for(let i=0;i<=idx;i++) s+=arr[i][key]; return s;
  }

  window.SHARED = {
    CONST, fmt, fmtInt, fmtTs,
    readAsTextAuto, parseRaw, analyseTrades, buildKPI,
    drawCurve, renderTradeTable
  };
})();
</script>
