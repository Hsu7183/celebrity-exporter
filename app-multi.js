import {
  parseTxt, buildKPI, kpiToMiniText, drawChart,
  fmtInt, fmtTs, readAsText, trimName
} from './shared.js';

const $ = q => document.querySelector(q);
const equityCvs  = $('#equityChart');
const tbl        = $('#tbl');
const paramChips = $('#paramChips');
const kpiBox     = $('#kpiBox');
const sumBody    = $('#summaryBody');

$('#files').addEventListener('change', handleFiles);
$('#btn-clear').addEventListener('click', () => {
  tbl.querySelector('tbody').innerHTML = '';
  paramChips.innerHTML = '';
  kpiBox.innerHTML = '';
  sumBody.innerHTML = '';
  if (window.chart) { window.chart.destroy?.(); }
});

async function handleFiles(e){
  const files = [...e.target.files];
  if(!files.length) return;

  const all = [];
  for(const f of files){
    const raw = await readAsText(f);
    const parsed = parseTxt(raw);
    if(!parsed || !parsed.tr.length) continue;

    const kpi = buildKPI(parsed.tr, parsed.seq);

    all.push({
      name: f.name,
      short: trimName(f.name),
      params: parsed.params,
      tr: parsed.tr,
      tsArr: parsed.tsArr,
      seq: parsed.seq,
      kpi
    });
  }

  if(!all.length){
    alert('沒有成功配對的交易'); return;
  }

  // 第一筆 → 畫圖 + 右側資訊
  mountFirst(all[0]);

  // 彙總（每檔一行）
  mountSummary(all);
}

function mountFirst(item){
  // 參數 chips
  paramChips.innerHTML = (item.params?.length ? item.params : [])
    .map(v => `<span class="chip">${v}</span>`).join('');

  // KPI 摘要（簡約）
  kpiBox.innerHTML = kpiToMiniText(item.kpi);

  // 交易明細
  renderTable(item.tr);

  // 圖表
  drawChart(equityCvs, item.tsArr, item.seq.tot, item.seq.lon, item.seq.sho, item.seq.sli);
}

function renderTable(list){
  const body = tbl.querySelector('tbody'); body.innerHTML = '';
  let cum=0, cumSlip=0;
  list.forEach((t,i)=>{
    cum += t.gain; cumSlip += t.gainSlip;
    body.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${i+1}</td>
        <td>${fmtTs(t.pos.tsIn)}</td>
        <td>${t.pos.pIn}</td>
        <td>${fmtTs(t.tsOut)}</td>
        <td>${t.priceOut}</td>
        <td>${t.pos.side==='L'?'多':'空'}</td>
        <td>${t.pts}</td>
        <td>${fmtInt(45*2)}</td>
        <td>${fmtInt(Math.round(t.priceOut*200*0.00004))}</td>
        <td>${fmtInt(t.gain)}</td>
        <td>${fmtInt(cum)}</td>
        <td>${fmtInt(t.gainSlip)}</td>
        <td>${fmtInt(cumSlip)}</td>
      </tr>
    `);
  });
}

function mountSummary(items){
  sumBody.innerHTML = '';
  items.forEach(it=>{
    const p = (it.params||[]).join(' / ');
    const k = it.kpi;
    // ProfitFactor：用累積獲利/單日最大虧損的粗估（你要換公式再告訴我）
    const pf = (k.all.gsum / Math.abs(k.all.dayMin || 1)).toFixed(2);

    sumBody.insertAdjacentHTML('beforeend', `
      <tr>
        <td><b>${it.short}</b></td>
        <td style="text-align:left">${p}</td>
        <td>${k.all.n}</td>
        <td>${(k.all.winr*100).toFixed(1)}%</td>
        <td>${fmtInt(k.all.gsum)}</td>
        <td>${pf}</td>
        <td>${fmtInt(k.all.dayMax)}</td>
        <td>${fmtInt(k.all.drawDn)}</td>
        <td>${(k.L.winr*100).toFixed(1)}%</td>
        <td>${fmtInt(k.L.gsum)}</td>
        <td>${(k.S.winr*100).toFixed(1)}%</td>
        <td>${fmtInt(k.S.gsum)}</td>
      </tr>
    `);
  });
}
