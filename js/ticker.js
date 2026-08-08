/* ── 实时行情（Worker 代理） ──
 * 数据源：/api/quote（TradingView 同源，实时，3s 缓存）
 * 失败时回退 /api/sina（新浪兜底）
 */
(function () {
  var track = document.getElementById('ticker-track');
  if (!track) return;

  var CFG = {
    gold:   { label: 'XAUUSD', dec: 2 },
    dxy:    { label: 'DXY',    dec: 2 },
    eurusd: { label: 'EURUSD', dec: 4 },
    usdjpy: { label: 'USDJPY', dec: 3 },
    btcusd: { label: 'BTCUSD', dec: 0 },
  };
  // 新浪兜底字段名（/api/sina 返回的 key）→ 上表 key
  var SINA_MAP = {
    hf_XAU: 'gold', fx_seurusd: 'eurusd', fx_susdjpy: 'usdjpy',
  };

  var KEYS = Object.keys(CFG);
  var CACHE_KEY = 'tkr_v8';
  var busy = false;
  var cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) {}
  var firstLoad = true;

  function buildHTML(items) {
    var h = '';
    KEYS.forEach(function (k) {
      var d = items[k];
      if (!d) return;
      var cfg = CFG[k];
      var p = d.price, pre = d.prev, ch = d.change;
      var hasCh = (pre !== null && pre !== undefined && typeof ch === 'number');
      var dir = (!hasCh || ch >= 0) ? 'up' : 'down';
      var arrow = hasCh ? (ch >= 0 ? '▲' : '▼') : '';
      var chStr = hasCh ? ((ch >= 0 ? '+' : '') + ch.toFixed(cfg.dec)) : '';
      var flash = (hasCh && pre !== p) ? (p > pre ? 'flash-up' : 'flash-down') : '';

      h += '<span class="tkr">' +
        '<span class="tkr-label">' + cfg.label + '</span>' +
        '<span class="tkr-price ' + dir + ' ' + flash + '">' + p.toFixed(cfg.dec) + '</span>' +
        (chStr ? '<span class="tkr-change ' + dir + '">' + arrow + ' ' + chStr + '</span>' : '') +
        '</span><span class="tkr-sep">◆</span>';
    });
    return h;
  }

  function render(items) {
    var inner = buildHTML(items);
    if (!inner) return;
    track.innerHTML = inner + inner;
    var toSave = {};
    KEYS.forEach(function (k) { if (items[k]) toSave[k] = { price: items[k].price }; });
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(toSave)); } catch (e) {}
    cache = items;
  }

  // 归一化为 CFG keys 的 items 结构
  function toNormal(data, mode) {
    var items = {};
    KEYS.forEach(function (k) {
      var srcKey = k;
      if (mode === 'sina') {
        var found = null;
        for (var s in SINA_MAP) { if (SINA_MAP[s] === k) { found = s; break; } }
        srcKey = found;
        if (!found) return;
      }
      var p = data[srcKey];
      if (!p || !p.price) return;
      var price = p.price;
      var old = cache[k] ? cache[k].price : null;
      var change = (old !== null && old !== undefined) ? (price - old) : null;
      items[k] = { price: price, prev: old, change: change };
    });
    return items;
  }

  async function doFetch() {
    if (busy) return;
    busy = true;
    var items = null;

    try {
      var q = await fetch('/api/quote');
      if (q.ok) {
        var dq = await q.json();
        items = toNormal(dq, 'quote');
        if (!KEYS.some(function (k) { return items[k]; })) items = null;
      }
    } catch (e) { items = null; }

    if (!items) {
      try {
        var s = await fetch('/api/sina');
        if (s.ok) {
          var ds = await s.json();
          items = toNormal(ds, 'sina');
        }
      } catch (e2) { items = null; }
    }

    if (items && KEYS.some(function (k) { return items[k]; })) {
      firstLoad = !Object.keys(cache).length;
      render(items);
      if (firstLoad) firstLoad = false;
    }
    busy = false;
  }

  doFetch();
  setInterval(doFetch, 3000);
})();