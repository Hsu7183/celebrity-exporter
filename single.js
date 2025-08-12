/* ===== 參數 ===== */
const MULT = 200, FEE = 45, TAX = 0.00004, SLIP = 1.5;
const ENTRY = ['新買', '新賣'];
const EXIT_L = ['平賣', '強制平倉'];
const EXIT_S = ['平買', '強制平倉'];
const ACTS = new Set([...ENTRY, ...EXIT_L, ...EXIT_S]);

const cvs = document.getElementById('equityChart');
const tbl = document.getElementById('tbl');
const paramsBox = document.getElementById('params');

/* ---------- KPI 容器（舊樣式沿用） ---------- */
let statBox = document.getElementById('stats');

/* ---------- 讀取剪貼簿 / 檔案 ---------- */
document.getElementById('btn-clip').onclick = async e => {
  try { analyse(await navigator.clipboard.readText()); flash(e.target); }
  catch (err) { alert(err.message); }
};

document.getElementById('fileInput').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const read = enc => new Promise((ok, no) => {
    const r = new FileReader();
    r.onload  = () => ok(r.result);
    r.onerror = () => no(r.error);
    enc ? r.readAsText(f, enc) : r.readAsText(f);
  });
  (async () => {
    try { analyse(await read('big5')); } catch { analyse(await read()); }
    flash(e.target.parentElement);
  })();
};

/* ---------- 主分析 ---------- */
function analyse(raw) {
  // 逐行清理
  const rows = String(raw || '')
    .split(/\r?\n/)
    .map(s => s.replace(/\uFEFF/g,'').trim())
    .filter(Boolean);

  if (!rows.length) { alert('空檔案'); return; }

  // 試圖辨識第一行參數（不納入計算）
  const parsedParam = tryParseParams(rows[0]);
  let startIdx = 0;
  if (parsedParam) {
    renderParams(parsedParam, rows[0]);
    startIdx = 1; // 後續計算從第 2 行開始
  } else {
    paramsBox.innerHTML = ''; // 沒有參數就清空
  }

  const q = [], tr = [];
  const tsArr = [], tot = [], lon = [], sho = [], sli = [];
  let cum = 0, cumL = 0, cumS = 0, cumSlip = 0;

  for (let i = startIdx; i < rows.length; i++) {
    const parts = rows[i].split(/\s+/).filter(Boolean);
    if (parts.length < 3) continue;

    // 動作取最後一欄，容錯中間有其他欄位
    const act = parts[parts.length - 1].replace(/\s/g,'');
    if (!ACTS.has(act)) continue;

    // 時間第一欄；允許含小數點，去掉非數字
    let tsRaw = parts[0].replace(/\D/g,'');
    if (tsRaw.length < 12) continue;
    tsRaw = tsRaw.slice(0, 12); // YYYYMMDDHHMM

    // 價格第二欄（可帶小數）
    const price = parseFloat(parts[1]);
    if (!Number.isFinite(price)) continue;

    if (ENTRY.includes(act)) {
      q.push({ side: act === '新買' ? 'L' : 'S', pIn: price, tsIn: tsRaw });
      continue;
    }

    const qi = q.findIndex(o =>
      (o.side === 'L' && EXIT_L.includes(act)) ||
      (o.side === 'S' && EXIT_S.includes(act))
    );
    if (qi === -1) continue;
    const pos = q.splice(qi, 1)[0];

    const pts  = pos.side === 'L' ? price - pos.pIn : pos.pIn - price;
    const fee  = FEE * 2, tax = Math.round(price * MULT * TAX);
    const gain = pts * MULT - fee - tax;
    const gainSlip = gain - SLIP * MULT;

    cum += gain; cumSlip += gainSlip;
    if (pos.side === 'L') cumL += gain; else cumS += gain;

    tr.push({ pos, tsOut: tsRaw, priceOut: price, pts, gain, gainSlip });

    tsArr.push(tsRaw);
    tot.push(cum); lon.push(cumL); sho.push(cumS); sli.push(cumSlip);
  }

  if (!tr.length) { alert('沒有成功配對的交易'); return; }

  // 2) KPI
  renderStats(tr, { tot, lon, sho, sli });

  // 3) 損益曲線（共用）
  drawCurve(cvs, tsArr, tot, lon, sho, sli);

  // 4) 交易表
  renderTable(tr);
}

/* ---------- 參數解析/呈現 ---------- */
function tryParseParams(line){
  // 條件：至少 3 個數字欄，且大部分都是數值
  const toks = line.trim().split(/\s+/);
  const nums = toks.map(t => parseFloat(t)).filter(n => Number.isFinite(n));
  if (nums.length >= 3 && nums.length >= Math.floor(toks.length * 0.8)) return nums;
  return null;
}

function renderParams(nums, rawLine){
  const items = nums.map((v,i)=>`<div class="param-item"><span class="param-key">P${i+1}</span>：<span class="param-val">${fmt(v)}</span></div>`).join('');
  paramsBox.innerHTML = `
    <section>
      <h3>參數（不納入損益計算）</h3>
      <div class="param-grid">${items}</div>
      <div class="param-raw">原始字串：${escapeHTML(rawLine)}</div>
    </section>
  `;
}

/* ---------- KPI（沿用舊樣式） ---------- */
function renderStats(tr, seq) {
  const sum = arr => arr.reduce((a, b) => a + b, 0);
  const pct = x => (x * 100).toFixed(1) + '%';
  const byDay = list => {
    const m = {};
    list.forEach(t => { const d = t.tsOut.slice(0, 8); m[d] = (m[d] || 0) + t.gain; });
    return Object.values(m);
  };
  const drawUp = s => { let min = s[0], up = 0; s.forEach(v => { min = Math.min(min, v); up = Math.max(up, v - min); }); return up; };
  const drawDn = s => { let peak = s[0], dn = 0; s.forEach(v => { peak = Math.max(peak, v); dn = Math.min(dn, v - peak); }); return dn; };

  const longs  = tr.filter(t => t.pos.side === 'L');
  const shorts = tr.filter(t => t.pos.side === 'S');

  const make = (list, cumSeq) => {
    const win  = list.filter(t => t.gain > 0);
    const loss = list.filter(t => t.gain < 0);
    return {
      '交易數'        : list.length,
      '勝率'          : pct(win.length  / (list.length || 1)),
      '敗率'          : pct(loss.length / (list.length || 1)),
      '正點數'        : sum(win .map(t => t.pts)),
      '負點數'        : sum(loss.map(t => t.pts)),
      '總點數'        : sum(list.map(t => t.pts)),
      '累積獲利'      : sum(list.map(t => t.gain)),
      '滑價累計獲利'  : sum(list.map(t => t.gainSlip)),
      '單日最大獲利'  : Math.max(...byDay(list)),
      '單日最大虧損'  : Math.min(...byDay(list)),
      '區間最大獲利'  : drawUp(cumSeq),
      '區間最大回撤'  : drawDn(cumSeq)
    };
  };

  const stats = {
    '全部': make(tr     , seq.tot),
    '多單': make(longs  , seq.lon),
    '空單': make(shorts , seq.sho)
  };

  let html = '';
  Object.entries(stats).forEach(([title, obj]) => {
    html += `<section><h3>${title}</h3><div class="stat-grid">`;
    Object.entries(obj).forEach(([k, v]) => {
      html += `<div class="stat-item"><span class="stat-key">${k}</span>：<span class="stat-val">${fmt(v)}</span></div>`;
    });
    html += '</div></section>';
  });
  statBox.innerHTML = html;
}

/* ---------- 交易紀錄表 ---------- */
function renderTable(list) {
  const body = tbl.querySelector('tbody'); body.innerHTML = '';
  list.forEach((t, i) => {
    body.insertAdjacentHTML('beforeend', `
      <tr>
        <td rowspan="2">${i + 1}</td>
        <td>${fmtTs(t.pos.tsIn)}</td><td>${t.pos.pIn}</td><td>${t.pos.side === 'L' ? '新買' : '新賣'}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
      </tr>
      <tr>
        <td>${fmtTs(t.tsOut)}</td><td>${t.priceOut}</td><td>${t.pos.side === 'L' ? '平賣' : '平買'}</td>
        <td>${fmt(t.pts)}</td><td>${fmt(FEE * 2)}</td><td>${fmt(Math.round(t.priceOut * MULT * TAX))}</td>
        <td>${fmt(t.gain)}</td><td>${fmt(sumUpTo(list, i, 'gain'))}</td>
        <td>${fmt(t.gainSlip)}</td><td>${fmt(sumUpTo(list, i, 'gainSlip'))}</td>
      </tr>
    `);
  });
  tbl.hidden = false;
}

/* ---------- 工具 ---------- */
const fmt   = n => typeof n==='number' ? n.toLocaleString('zh-TW',{maximumFractionDigits:2}) : n;
const fmtTs = s => `${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)} ${s.slice(8,10)}:${s.slice(10,12)}`;
function flash(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),600);}
function sumUpTo(arr, idx, key){return arr.slice(0, idx + 1).reduce((a,b)=>a + b[key], 0);}
function escapeHTML(s=''){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
