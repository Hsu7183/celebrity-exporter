// 主要腳本：抓取新聞、解析人名、更新UI
const startBtn = document.getElementById('startBtn');
const cancelBtn = document.getElementById('cancelBtn');
const downloadBtn = document.getElementById('downloadBtn');
const timeRangeSelect = document.getElementById('timeRange');
const maxNewsInput = document.getElementById('maxNews');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const statusMessage = document.getElementById('statusMessage');

// 全域狀態
let cancelRequested = false;   // 用戶是否請求取消
let fetchedArticles = [];      // 收集的新聞列表 {title, url, source, date}
let results = [];              // 人名（含來源）的結果列表

// 跨域代理設定（選擇公共 proxy 服務）
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';  // AllOrigins的raw代理

// 各新聞來源的 RSS 或列表 URL 設定
const sources = [
  {
    name: '自由時報',
    // RSS: 即時新聞 (所有分類)
    rss: 'https://news.ltn.com.tw/rss/all.xml'
  },
  {
    name: '聯合報',
    rss: 'https://udn.com/rssfeed/news/2/6638?ch=news'  // 假設聯合報即時 RSS（需替換為實際）
  },
  {
    name: '中國時報',
    rss: ''  // 若無官方RSS，可透過 RSSHub 或其他方法
  },
  {
    name: 'ETtoday',
    rss: 'https://feeds.ettoday.net/news.xml'  // ETtoday 新聞雲 RSS（假設存在）
  },
  {
    name: '三立新聞',
    rss: ''  // 若無，可使用RSSHub或抓取首頁
  },
  {
    name: 'TVBS',
    rss: ''  // 類似處理
  }
];

// 輔助函數：取得時間區間的起始日期
function getStartDate(daysAgo) {
  const now = new Date();
  // 計算 daysAgo 天前的0時0分（不含當日）
  now.setHours(0, 0, 0, 0); 
  const past = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
  return past;
}

// 輔助函數：解析 RSS XML 並返回項目清單
function parseRSS(xmlText, sourceName, startDate) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
  const items = Array.from(xmlDoc.querySelectorAll('item'));
  const list = [];
  items.forEach(item => {
    const title = item.querySelector('title')?.textContent || '';
    const link = item.querySelector('link')?.textContent || '';
    const pubDateText = item.querySelector('pubDate')?.textContent || 
                        item.querySelector('dc\\:date')?.textContent || '';
    let pubDate = new Date(pubDateText);
    if (pubDate.toString() === 'Invalid Date' && pubDateText) {
      // 部分RSS可能使用ISO 8601格式或其它，需要嘗試解析
      pubDate = new Date(Date.parse(pubDateText));
    }
    // 如果pubDate不存在，預設視為符合（或使用當前日期）
    if (!pubDateText || isNaN(pubDate.getTime()) || pubDate >= startDate) {
      // 在所需日期範圍內，或無日期資訊也先抓
      if (title && link) {
        list.push({ title: title.trim(), url: link.trim(), source: sourceName, date: pubDate });
      }
    }
  });
  return list;
}

// 人名辨識：從一篇文章文字中提取人名（簡化實作）
function extractNamesFromText(text) {
  const namesFound = new Set();
  // 基本中文姓名匹配（以常見姓氏開頭，後接一至兩字）
  const commonSurnames = '王李張劉陳楊黃吳趙周徐孫胡朱高林何郭馬羅';  // 範例常見姓氏
  const namePattern = new RegExp(`([${commonSurnames}][\\p{Script=Han}]{1,2})`, 'ug');
  let match;
  while ((match = namePattern.exec(text)) !== null) {
    const name = match[1];
    // 過濾明顯的假名或非人名詞（如含「某」「者」等非特定人名字眼）
    if (name.includes('某') || name.includes('者')) continue;
    namesFound.add(name);
  }
  return Array.from(namesFound);
}

// 更新進度顯示
function updateProgress(count, total) {
  const percent = total === 0 ? 0 : (count / total) * 100;
  progressBar.value = percent;
  progressText.textContent = percent.toFixed(2) + '%';
}

// 重置/初始化狀態
function resetStatus() {
  cancelRequested = false;
  progressBar.value = 0;
  progressText.textContent = '0.00%';
  statusMessage.textContent = '';
  results = [];
  fetchedArticles = [];
  downloadBtn.style.display = 'none';
}

// 主流程：開始爬取新聞
async function startFetching() {
  // 初始化狀態
  resetStatus();
  startBtn.disabled = true;
  cancelBtn.disabled = false;
  
  // 決定起始日期
  const days = parseInt(timeRangeSelect.value) || 1;
  const startDate = getStartDate(days);
  
  // 第一步：收集所有來源的新聞列表
  let totalToFetch = 0;
  for (const src of sources) {
    if (cancelRequested) break;
    if (!src.rss) continue;  // 目前僅處理有RSS的來源（無RSS的可加額外流程）
    try {
      const url = CORS_PROXY + encodeURIComponent(src.rss);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch RSS for ${src.name}`);
      const xmlText = await res.text();
      // 解析RSS得到該來源符合日期的新聞項目列表
      const items = parseRSS(xmlText, src.name, startDate);
      fetchedArticles.push(...items);
    } catch (err) {
      console.error(`Error fetching ${src.name}:`, err);
      statusMessage.textContent = '發生錯誤，請稍後重試';
      cancelBtn.disabled = true;
      startBtn.disabled = false;
      return;  // 中止整個流程
    }
  }
  
  if (cancelRequested) {
    // 若中途取消
    statusMessage.textContent = '已取消爬取';
    startBtn.disabled = false;
    cancelBtn.disabled = true;
    return;
  }
  
  // 篩選符合日期的新聞列表已收集完畢
  if (fetchedArticles.length === 0) {
    statusMessage.textContent = '找不到符合條件的新聞';
    startBtn.disabled = false;
    cancelBtn.disabled = true;
    return;
  }
  
  // 如果超過使用者設定的最大數量，截取前面部分（假設列表已經按日期排序，可選擇最新的）
  const maxCount = parseInt(maxNewsInput.value) || 100;
  if (fetchedArticles.length > maxCount) {
    fetchedArticles = fetchedArticles.slice(0, maxCount);
  }
  totalToFetch = fetchedArticles.length;
  
  // 第二步：逐篇抓取新聞內容並處理
  let completed = 0;
  for (const article of fetchedArticles) {
    if (cancelRequested) break;
    try {
      // 抓取新聞 HTML內容
      const url = CORS_PROXY + encodeURIComponent(article.url);
      const controller = new AbortController();
      const signal = controller.signal;
      // 在取消請求時調用 controller.abort()
      const fetchPromise = fetch(url, { signal });
      // 若使用者按下取消，我們中斷請求
      if (cancelRequested) { controller.abort(); break; }
      const res = await fetchPromise;
      if (!res.ok) throw new Error(`Failed to fetch article: ${article.url}`);
      const html = await res.text();
      // 解析 HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      // 根據來源選擇適當的選取器提取文章內容文字
      let contentText = '';
      if (article.source === '自由時報') {
        const contentDiv = doc.querySelector('div.text') || doc.querySelector('div#newstext');
        contentText = contentDiv ? contentDiv.innerText : '';
      } else if (article.source === '聯合報') {
        const contentSec = doc.querySelector('section#story-body') || doc.querySelector('.article-content');
        contentText = contentSec ? contentSec.innerText : '';
      } else if (article.source === 'ETtoday') {
        const contentDiv = doc.querySelector('.story') || doc.querySelector('#story');
        contentText = contentDiv ? contentDiv.innerText : '';
      } else if (article.source === '中國時報') {
        const contentDiv = doc.querySelector('.article-body') || doc.querySelector('#artbody');
        contentText = contentDiv ? contentDiv.innerText : '';
      } else if (article.source === '三立新聞') {
        const contentDiv = doc.querySelector('.news-content') || doc.querySelector('.article-content');
        contentText = contentDiv ? contentDiv.innerText : '';
      } else if (article.source === 'TVBS') {
        const contentDiv = doc.querySelector('.newsdetail_content') || doc.querySelector('.news_content');
        contentText = contentDiv ? contentDiv.innerText : '';
      }
      if (!contentText) {
        // 若沒有取到內容，跳過
        console.warn(`No content extracted for ${article.url}`);
        completed++;
        updateProgress(completed, totalToFetch);
        continue;
      }
      // 提取人名
      const names = extractNamesFromText(contentText);
      names.forEach(name => {
        results.push(`${name}（${article.source}）`);
      });
    } catch (err) {
      console.error('Error processing article:', err);
      statusMessage.textContent = '發生錯誤，請稍後重試';
      cancelRequested = true;  // 發生錯誤，自動停止
      break;
    }
    completed++;
    updateProgress(completed, totalToFetch);
  }
  
  cancelBtn.disabled = true;
  startBtn.disabled = false;
  
  if (cancelRequested) {
    // 若抓取過程被取消或錯誤導致中止
    if (statusMessage.textContent === '') {
      statusMessage.textContent = '已取消爬取';
    }
    return;
  }
  
  // 完成抓取處理
  progressBar.value = 100;
  progressText.textContent = '100.00%';
  statusMessage.textContent = `完成！共擷取 ${results.length} 筆人名`;
  if (results.length > 0) {
    downloadBtn.style.display = 'inline-block';
  } else {
    // 若沒有任何名字結果
    statusMessage.textContent += '（未找到人名）';
  }
}

// 下載結果為 TXT 文件
function downloadResults() {
  if (results.length === 0) return;
  const content = results.join('\n');
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'names.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 綁定事件處理
startBtn.addEventListener('click', () => {
  startFetching();
});
cancelBtn.addEventListener('click', () => {
  cancelRequested = true;
});
downloadBtn.addEventListener('click', downloadResults);
