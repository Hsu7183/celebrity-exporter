// shared.js（單檔共用：含月條紋背景、最後值與極值標記）
let __curveChart;
function drawCurve(cvs, tsArr, T, L, S, P){
  try{
    if(!cvs || !Array.isArray(tsArr) || tsArr.length===0 ||
       !Array.isArray(T) || T.length===0){
      if(__curveChart){ __curveChart.destroy(); __curveChart = null; }
      return;
    }
    const ts0 = String(tsArr[0] ?? '');
    if(ts0.length < 6){ if(__curveChart){__curveChart.destroy();__curveChart=null;} return; }

    L = Array.isArray(L) ? L : [];
    S = Array.isArray(S) ? S : [];
    P = Array.isArray(P) ? P : [];

    const ym2Date = ym => new Date(+ym.slice(0,4), +ym.slice(4,6)-1);
    const addM = (d,n)=>new Date(d.getFullYear(), d.getMonth()+n);
    const start = addM(ym2Date(ts0.slice(0,6)),-1);

    const months=[];
    for(let d=start; months.length<26; d=addM(d,1))
      months.push(`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}`);
    const mIdx={}; months.forEach((m,i)=>mIdx[m.replace('/','')]=i);

    const daysInMonth=(y,m)=>new Date(y,m,0).getDate();
    const X = tsArr.map(ts=>{
      const s=String(ts);
      const y=+s.slice(0,4), m=+s.slice(4,6), d=+s.slice(6,8);
      const hh=+s.slice(8,10)||0, mm=+s.slice(10,12)||0;
      return (mIdx[s.slice(0,6)]??0) + (d-1 + (hh+mm/60)/24)/daysInMonth(y,m);
    });

    const maxI = T.indexOf(Math.max(...T));
    const minI = T.indexOf(Math.min(...T));

    const stripe={id:'stripe',beforeDraw(c){const{ctx,chartArea:{left,right,top,bottom}}=c,w=(right-left)/26;
      ctx.save();months.forEach((_,i)=>{ctx.fillStyle=i%2?'rgba(0,0,0,.05)':'transparent';
      ctx.fillRect(left+i*w,top,w,bottom-top);});ctx.restore();}};
    const mmLabel={id:'mmLabel',afterDraw(c){const{ctx,chartArea:{left,right,bottom}}=c,w=(right-left)/26;
      ctx.save();ctx.font='11px sans-serif';ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#555';
      months.forEach((m,i)=>ctx.fillText(m,left+w*(i+.5),bottom+8));ctx.restore();}};

    const mkLine=(d,col)=>({data:d,stepped:true,borderColor:col,borderWidth:2,
      pointRadius:4,pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1});
    const mkLast=(d,col)=>({data:d.map((v,i)=>i===d.length-1?v:null),showLine:false,pointRadius:6,
      pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1,
      datalabels:{display:true,anchor:'center',align:'right',offset:8,
        formatter:v=>v?.toLocaleString('zh-TW')??'',color:'#000',clip:false,font:{size:10}}});
    const mkMark=(d,i,col)=>({data:d.map((v,j)=>j===i?v:null),showLine:false,pointRadius:6,
      pointBackgroundColor:col,pointBorderColor:col,pointBorderWidth:1,
      datalabels:{display:true,anchor:i===maxI?'end':'start',align:i===maxI?'top':'bottom',offset:8,
        formatter:v=>v?.toLocaleString('zh-TW')??'',color:'#000',clip:false,font:{size:10}}});

    if(__curveChart) __curveChart.destroy();
    __curveChart = new Chart(cvs,{
      type:'line',
      data:{labels:X,datasets:[
        mkLine(T,'#fbc02d'), mkLine(L,'#d32f2f'), mkLine(S,'#2e7d32'), mkLine(P,'#212121'),
        mkLast(T,'#fbc02d'), mkLast(L,'#d32f2f'), mkLast(S,'#2e7d32'), mkLast(P,'#212121'),
        ...(maxI>=0?[mkMark(T,maxI,'#d32f2f')]:[]),
        ...(minI>=0?[mkMark(T,minI,'#2e7d32')]:[])
      ]},
      options:{
        responsive:true,maintainAspectRatio:false,
        layout:{padding:{bottom:42,right:60}},
        plugins:{legend:{display:false},
          tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('zh-TW')}},
          datalabels:{display:false}},
        scales:{x:{type:'linear',min:0,max:25.999,grid:{display:false},ticks:{display:false}},
                y:{ticks:{callback:v=>v.toLocaleString('zh-TW')}}}
      },
      plugins:[stripe,mmLabel,ChartDataLabels]
    });
  }catch(err){
    console.error(err);
    if(__curveChart){ __curveChart.destroy(); __curveChart = null; }
  }
}

window.drawCurve = drawCurve;
