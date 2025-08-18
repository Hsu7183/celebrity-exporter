/* 批量頁面 */
(function(){
  const $ = s=>document.querySelector(s);
  let chart, datasets=[], sortKey='gain', sortAsc=false, currentIdx=0;

  function draw(tsArr, T,L,S,P){
    if(chart) chart.destroy();
    const labels = tsArr.map((_,i)=>i);
    const mkLine=(d,c)=>({data:d,stepped:true,borderColor:c,borderWidth:2,pointRadius:2,
      pointBackgroundColor:c,pointBorderColor:c,pointBorderWidth:1});
    chart = new Chart($('#mChart'),{
      type:'line',
      data:{labels, datasets:[ mkLine(T,'#111'), mkLine(L,'#d32f2f'), mkLine(S,'#2e7d32'), mkLine(P,'#f59e0b') ]},
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false}},
        scales:{x:{grid:{display:false},ticks:{display:false}}, y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}}
      }
    });
  }

  function brief(statAll, statL, statS){
    const {fmtMoney,pct} = window.SHARED;
    return [
      `全部：交數 ${statAll.count}｜勝率 ${pct(statAll.winRate)}｜敗率 ${pct(statAll.loseRate)}｜單日最大獲利 ${fmtMoney(statAll.dayMax)}｜區間最大回撤 ${fmtMoney(statAll.dd)}｜累積獲利 ${fmtMoney(statAll.gain)}`,
      `多單：交數 ${statL.count}｜勝率 ${pct(statL.winRate)}｜累積 ${fmtMoney(statL.gain)}`,
      `空單：交數 ${statS.count}｜勝率 ${pct(statS.winRate)}｜累積 ${fmtMoney(statS.gain)}`
    ].join(' ｜ ');
  }

  function renderTop(d){
    $('#mParams').textContent = window.SHARED.paramsLabel(d.params);
    $('#mKpi').textContent = brief(d.statAll, d.statL, d.statS);
    draw(d.tsArr, d.total, d.longCum, d.shortCum, d.slipCum);
    // trades
    const {fmtTs,fmtMoney,MULT,FEE,TAX} = window.SHARED;
    const tb=$('#mTrades tbody'); tb.innerHTML='';
    let cum=0,cumSlip=0;
    d.trades.forEach((t,i)=>{
      cum+=t.gain; cumSlip+=t.gainSlip;
      const tr1=document.createElement('tr');
      tr1.innerHTML=`
        <td rowspan="2">${i+1}</td>
        <td>${fmtTs(t.pos.tsIn)}</td><td>${t.pos.pIn}</td><td>${t.pos.side==='L'?'新買':'新賣'}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>`;
      const tr2=document.createElement('tr');
      tr2.innerHTML=`
        <td>${fmtTs(t.tsOut)}</td><td>${t.priceOut}</td><td>${t.pos.side==='L'?'平賣':'平買'}</td>
        <td>${t.pts}</td><td>${FEE*2}</td><td>${Math.round(t.priceOut*MULT*TAX)}</td>
        <td>${fmtMoney(t.gain)}</td><td>${fmtMoney(cum)}</td>
        <td>${fmtMoney(t.gainSlip)}</td><td>${fmtMoney(cumSlip)}</td>`;
      tb.appendChild(tr1); tb.appendChild(tr2);
    });
  }

  function buildRow(d, idx){
    const {fmtMoney,pct,paramsLabel} = window.SHARED;
    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td class="nowrap"><span class="row-link" data-idx="${idx}">${d.nameTime}</span></td>
      <td class="nowrap">${paramsLabel(d.params)}</td>
      <td>${d.statAll.count}</td>
      <td>${pct(d.statAll.winRate)}</td>
      <td>${fmtMoney(d.statAll.gain)}</td>
      <td>${(d.statAll.gain/Math.abs(d.statAll.dayMin||1)).toFixed(2)}</td>
      <td>${fmtMoney(d.statAll.dayMax)}</td>
      <td>${fmtMoney(d.statAll.dd)}</td>
      <td>${fmtMoney(d.statL.gain)}</td>
      <td>${pct(d.statL.winRate)}</td>
      <td>${fmtMoney(d.statS.gain)}</td>
      <td>${pct(d.statS.winRate)}</td>
    `;
    return tr;
  }

  function renderSummary(){
    const tb = document.querySelector('#sumTable tbody');
    tb.innerHTML='';
    datasets.forEach((d,i)=>tb.appendChild(buildRow(d,i)));
  }

  function sortSummary(key){
    sortAsc = (sortKey===key) ? !sortAsc : false;
    sortKey = key;
    const n = v=>+String(v).replace(/[,%]/g,'');
    datasets.sort((a,b)=>{
      const map={
        name: x=>x.nameTime,
        params: x=>window.SHARED.paramsLabel(x.params),
        count: x=>x.statAll.count,
        winRate: x=>x.statAll.winRate,
        gain: x=>x.statAll.gain,
        pf: x=> (x.statAll.gain/Math.abs(x.statAll.dayMin||1)),
        dayMax: x=>x.statAll.dayMax,
        dd: x=>x.statAll.dd,
        gainL: x=>x.statL.gain,
        winL: x=>x.statL.winRate,
        gainS: x=>x.statS.gain,
        winS: x=>x.statS.winRate,
      };
      const av=map[key](a), bv=map[key](b);
      return sortAsc ? (av>bv?1:-1) : (av<bv?1:-1);
    });
    renderSummary();
  }

  // header sort
  document.querySelectorAll('#sumTable thead th').forEach(th=>{
    const key = th.getAttribute('data-key');
    if(!key) return;
    th.addEventListener('click', ()=>sortSummary(key));
  });

  // 點選列切換
  document.querySelector('#sumTable').addEventListener('click', e=>{
    const a = e.target.closest('.row-link'); if(!a) return;
    const idx = +a.getAttribute('data-idx')||0;
    currentIdx = idx;
    renderTop(datasets[idx]);
  });

  // 清空
  document.getElementById('clear').addEventListener('click', ()=>{
    datasets=[]; renderSummary();
    $('#mParams').textContent='—'; $('#mKpi').textContent='尚未載入';
    if(chart) chart.destroy();
    document.querySelector('#mTrades tbody').innerHTML='';
  });

  // 載入多檔
  document.getElementById('files').addEventListener('change', async e=>{
    const fs = Array.from(e.target.files||[]);
    if(!fs.length){ alert('未讀到可用檔案'); return; }
    const {readAsTextAuto, parseTXT, buildReport} = window.SHARED;
    datasets=[];
    for (const f of fs){
      const raw = await readAsTextAuto(f);
      const parsed = parseTXT(raw);
      const rpt = buildReport(parsed.rows);
      if (!rpt.trades.length) continue;
      const nameTime = (f.name.match(/^(\d{8}_\d{6})/)||[])[1] || f.name;
      datasets.push({...rpt, params:parsed.params, nameTime});
    }
    if(!datasets.length){ alert('沒有成功配對的交易'); return; }
    sortSummary('gain'); // 先做一次排序與渲染
    currentIdx=0; renderTop(datasets[0]);
  });
})();
