/* 單檔頁面 */
(function(){
  const {$, $$} = (()=>({ $:s=>document.querySelector(s), $$:s=>document.querySelectorAll(s) }))();

  const cvs = $('#chart');
  let chart;

  function drawChart(ser){
    if(chart) chart.destroy();
    const {tsArr,T,L,S,P} = ser;
    // X 軸用 0..N-1（避免月份空白）
    const labels = tsArr.map((_,i)=>i);

    const mkLine=(data,col)=>({data,stepped:true,borderColor:col,borderWidth:2,pointRadius:3,
      pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1});
    const mkLast=(data,col)=>({data:data.map((v,i)=>i===data.length-1?v:null),showLine:false,pointRadius:5,
      pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1,
      datalabels:{display:true,anchor:'end',align:'top',offset:6,
        formatter:v=>v?.toLocaleString('zh-TW')??''}});

    chart = new Chart(cvs,{
      type:'line',
      data:{labels, datasets:[
        mkLine(T,'#111'), mkLine(L,'#d32f2f'), mkLine(S,'#2e7d32'), mkLine(P,'#f59e0b'),
        mkLast(T,'#111'), mkLast(L,'#d32f2f'), mkLast(S,'#2e7d32'), mkLast(P,'#f59e0b'),
      ]},
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}}, datalabels:{display:false}},
        scales:{x:{grid:{display:false},ticks:{display:false}}, y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}}
      },
      plugins:[ChartDataLabels]
    });
  }

  function brief(statAll, statL, statS){
    const {fmtMoney,pct} = window.SHARED;
    const a = `全部：交易數 ${statAll.count}｜勝率 ${pct(statAll.winRate)}｜敗率 ${pct(statAll.loseRate)}｜單日最大獲利 ${fmtMoney(statAll.dayMax)}｜單日最大虧損 ${fmtMoney(statAll.dayMin)}｜區間最大獲利 ${fmtMoney(statAll.up)}｜區間最大回撤 ${fmtMoney(statAll.dd)}｜累積獲利 ${fmtMoney(statAll.gain)}｜滑價累計獲利 ${fmtMoney(statAll.gainSlip)}`;
    const l = `多單：交易數 ${statL.count}｜勝率 ${pct(statL.winRate)}｜敗率 ${pct(statL.loseRate)}｜單日最大獲利 ${fmtMoney(statL.dayMax)}｜單日最大虧損 ${fmtMoney(statL.dayMin)}｜區間最大獲利 ${fmtMoney(statL.up)}｜區間最大回撤 ${fmtMoney(statL.dd)}｜累積獲利 ${fmtMoney(statL.gain)}｜滑價累計獲利 ${fmtMoney(statL.gainSlip)}`;
    const s = `空單：交易數 ${statS.count}｜勝率 ${pct(statS.winRate)}｜敗率 ${pct(statS.loseRate)}｜單日最大獲利 ${fmtMoney(statS.dayMax)}｜單日最大虧損 ${fmtMoney(statS.dayMin)}｜區間最大獲利 ${fmtMoney(statS.up)}｜區間最大回撤 ${fmtMoney(statS.dd)}｜累積獲利 ${fmtMoney(statS.gain)}｜滑價累計獲利 ${fmtMoney(statS.gainSlip)}`;
    return [a,l,s].join(' ｜ ');
  }

  function renderTable(report){
    const {fmtTs, fmtMoney, MULT, FEE, TAX} = window.SHARED;
    const tb = document.querySelector('#tradeTable tbody');
    tb.innerHTML = '';
    let cum=0, cumSlip=0;
    report.trades.forEach((t,i)=>{
      cum += t.gain; cumSlip += t.gainSlip;
      const tr1 = document.createElement('tr');
      tr1.innerHTML = `
        <td rowspan="2">${i+1}</td>
        <td>${fmtTs(t.pos.tsIn)}</td><td>${t.pos.pIn}</td><td>${t.pos.side==='L'?'新買':'新賣'}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
      `;
      const tr2 = document.createElement('tr');
      tr2.innerHTML = `
        <td>${fmtTs(t.tsOut)}</td><td>${t.priceOut}</td><td>${t.pos.side==='L'?'平賣':'平買'}</td>
        <td>${t.pts}</td><td>${FEE*2}</td><td>${Math.round(t.priceOut*MULT*TAX)}</td>
        <td>${fmtMoney(t.gain)}</td><td>${fmtMoney(cum)}</td>
        <td>${fmtMoney(t.gainSlip)}</td><td>${fmtMoney(cumSlip)}</td>
      `;
      tb.appendChild(tr1); tb.appendChild(tr2);
    });
  }

  async function handleRaw(raw){
    const {parseTXT, buildReport, paramsLabel} = window.SHARED;
    const parsed = parseTXT(raw);
    const report = buildReport(parsed.rows);
    if (report.trades.length===0){
      alert('沒有成功配對的交易');
      return;
    }
    // 圖表資料
    drawChart({tsArr: report.tsArr, T:report.total, L:report.longCum, S:report.shortCum, P:report.slipCum});
    // KPI
    document.getElementById('paramChip').textContent = paramsLabel(parsed.params);
    document.getElementById('kpiBrief').textContent = brief(report.statAll, report.statL, report.statS);
    // 表格
    renderTable(report);
  }

  // 事件：貼上剪貼簿
  document.getElementById('btn-clip').addEventListener('click', async ()=>{
    const txt = await navigator.clipboard.readText();
    handleRaw(txt);
  });

  // 事件：載入檔案
  document.getElementById('file').addEventListener('change', async e=>{
    const f = e.target.files[0]; if(!f) return;
    try{
      const txt = await window.SHARED.readAsTextAuto(f);
      await handleRaw(txt);
    }catch(err){
      alert(err.message || '讀檔失敗');
    }
  });
})();
