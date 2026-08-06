/* ── 新浪实时行情 ── */
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
  var CACHE_KEY = 'tkr_v3';
  var busy = false;

  function loadCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveCache(d) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch (e) {}
  }

  var cache = loadCache();

  function buildHTML(items) {
    var h = '';
    KEYS.forEach(function (k) {
      var d = items[k];
      if (!d) return;
      var cfg = CFG[k];
      var p = d.price, pre = d.prev, ch = d.change, pct = d.pct || '--';
      var dir = ch >= 0 ? 'up' : 'down';
      var arrow = ch >= 0 ? '▲' : '▼';
      var chStr = (ch >= 0 ? '+' : '') + ch.toFixed(cfg.dec);
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
    void track.offsetWidth;               /* force reflow to restart animation */
    track.style.animation = 'scrollTicker 60s linear infinite';

    var toSave = {};
    KEYS.forEach(function (k) { if (items[k]) toSave[k] = { price: items[k].price }; });
    saveCache(toSave);
    cache = items;
  }

  async function doFetch() {
    if (busy) return;
    busy = true;
    try {
      var resp = await fetch('https://sina-proxy.362092939.workers.dev/');
      if (!resp.ok) return;
      var data = await resp.json();

      var items = {};
      KEYS.forEach(function (k) {
        var p = data[k];
        if (!p || !p.price) return;
        var price = p.price;
        if (isNaN(price)) return;

        var old = cache[k] ? cache[k].price : null;
        var change = (old !== null) ? price - old : 0;
        var pct = (old && old !== 0) ? ((change / old) * 100).toFixed(2) + '%' : null;

        items[k] = { price: price, prev: old, change: change, pct: pct };
      });

      if (KEYS.some(function (k) { return items[k]; })) {
        render(items);
      }
    } catch (e) {
      /* keep static fallback visible */
    }
    busy = false;
  }

  doFetch();
  setInterval(doFetch, 3000);
})();
