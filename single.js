const {readAsTextAuto, parseTxt, kpiCompact, drawChart, renderParams, renderKPI, renderDetail} = SHARED;

const cvs = document.getElementById('equityChart');
const paramLine = document.getElementById('paramLine');
const kpiBox = document.getElementById('kpiCompact');
const tbody = document.querySelector('#tbl tbody');

/* 讀剪貼簿 */
document.getElementById('btn-clip').onclick = async e=>{
  try{
    const txt = await navigator.clipboard.readText();
    handleRaw(txt);
  }catch(err){
    alert('讀取剪貼簿失敗：' + err.message);
  }
};

/* 選檔 */
document.getElementById('fileInput').onchange = async (e)=>{
  const f = e.target.files[0]; if(!f) return;
  try{
    const txt = await readAsTextAuto(f);
    handleRaw(txt);
  }catch(err){
    alert('讀檔失敗：' + err.message);
  }finally{
    e.target.value='';
  }
};

function handleRaw(raw){
  const {params,trades,seq} = parseTxt(raw);
  if (!trades.length){
    alert('沒有成功配對的交易');
    return;
  }
  renderParams(paramLine, params);
  renderKPI(kpiBox, kpiCompact(trades,seq));
  renderDetail(tbody, trades);
  drawChart(cvs, seq);
}
