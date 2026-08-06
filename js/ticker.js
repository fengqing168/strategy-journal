/* ── 新浪实时行情（SW 代理） ── */
(function () {
  var track = document.getElementById('ticker-track');
  if (!track) return;

  var CFG = {
    hf_XAU:      { label: 'XAUUSD', idx:  0, dec: 2 },
    fx_seurusd:  { label: 'EURUSD', idx:  1, dec: 4 },
    fx_sgbpusd:  { label: 'GBPUSD', idx:  1, dec: 4 },
    fx_susdjpy:  { label: 'USDJPY', idx:  1, dec: 3 },
    fx_susdcad:  { label: 'USDCAD', idx:  1, dec: 4 },
  };

  var KEYS = Object.keys(CFG);
  var CACHE_KEY = 'tkr_v4';
  var busy = false;
  var cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) {}

  function parseSina(text) {
    var items = {};
    var lines = text.split(';');
    lines.forEach(function (line) {
      var m = line.match(/hq_str_(\w+)="(.+)"/);
      if (!m) return;
      var key = m[1], fields = m[2].split(','), cfg = CFG[key];
      if (!cfg) return;
      var price = parseFloat(fields[cfg.idx]);
      if (!isNaN(price)) items[key] = { price: price, raw: fields };
    });
    return items;
  }

  function buildHTML(items) {
    var h = '';
    KEYS.forEach(function (k) {
      var d = items[k];
      if (!d) return;
      var cfg = CFG[k];
      var p = d.price, pre = d.prev, ch = d.change, pct = d.pct || '--';
      var dir = (ch === 1e9 || ch >= 0) ? 'up' : 'down';  /* ch=1e9 = first-load */
      var arrow = (ch === 1e9 || ch >= 0) ? '▲' : '▼';
      var chStr = (ch === 1e9) ? '——' : ((ch >= 0 ? '+' : '') + ch.toFixed(cfg.dec));
      var flash = (pre !== null && pre !== p) ? (p > pre ? 'flash-up' : 'flash-down') : '';

      h += '<span class="tkr">' +
        '<span class="tkr-label">' + cfg.label + '</span>' +
        '<span class="tkr-price ' + dir + ' ' + flash + '">' + p.toFixed(cfg.dec) + '</span>' +
        '<span class="tkr-change ' + dir + '">' + arrow + ' ' + chStr + '</span>' +
        '<span class="tkr-pct ' + dir + '">' + pct + '</span>' +
        '</span><span class="tkr-sep">◆</span>';
    });
    return h;
  }

  function render(items) {
    var inner = buildHTML(items);
    if (!inner) return;
    track.style.animation = 'none';
    track.innerHTML = inner + inner;
    void track.offsetWidth;
    track.style.animation = 'scrollTicker 60s linear infinite';
    var toSave = {};
    KEYS.forEach(function (k) { if (items[k]) toSave[k] = { price: items[k].price }; });
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(toSave)); } catch (e) {}
    cache = items;
  }

  async function doFetch() {
    if (busy) return;
    busy = true;
    try {
      var resp = await fetch('/__sina');
      if (!resp.ok) return;
      var text = await resp.text();
      var fresh = parseSina(text);

      var items = {};
      KEYS.forEach(function (k) {
        var n = fresh[k];
        if (!n) return;
        var price = n.price;
        var old = cache[k] ? cache[k].price : null;
        var change = (old !== null) ? (price - old) : 1e9;  /* 1e9 = first load */
        var pct = (old && old !== 0) ? ((change / old) * 100).toFixed(2) + '%' : null;
        items[k] = { price: price, prev: old, change: change, pct: pct };
      });

      if (KEYS.some(function (k) { return items[k]; })) {
        render(items);
      }
    } catch (e) {
      /* keep static fallback */
    }
    busy = false;
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
    navigator.serviceWorker.ready.then(function () {
      doFetch();
      setInterval(doFetch, 3000);
    });
  }
})();
