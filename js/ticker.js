/* ── 新浪实时行情 · JSONP ── */
(function () {
  var track = document.getElementById('ticker-track');
  if (!track) return;

  var CFG = {
    hf_XAU:        { label: 'XAUUSD',  idx: 0, dec: 2 },
    fx_seurusd:    { label: 'EURUSD',  idx: 1, dec: 4 },
    fx_sgbpusd:    { label: 'GBPUSD',  idx: 1, dec: 4 },
    fx_susdjpy:    { label: 'USDJPY',  idx: 1, dec: 3 },
    fx_susdcad:    { label: 'USDCAD',  idx: 1, dec: 4 }
  };

  var KEYS = Object.keys(CFG);
  var CACHE_KEY = 'tkr_sina_v2';
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
    void track.offsetWidth;
    track.style.animation = 'scrollTicker 60s linear infinite';

    var toSave = {};
    KEYS.forEach(function (k) { if (items[k]) toSave[k] = { price: items[k].price }; });
    saveCache(toSave);
    cache = items;
  }

  function doFetch() {
    if (busy) return;
    busy = true;

    var script = document.createElement('script');
    var ok = false;

    function done() {
      busy = false;
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    script.src = 'https://sina-quotes.362092939.workers.dev/?_=' + Date.now();
    script.onload = function () { ok = true; parse(); done(); };
    script.onerror = function () { done(); };

    /* 保底：1.5 秒后不管 onload 有没有触发，强行解析 */
    var fallback = setTimeout(function () {
      if (!ok) { parse(); done(); }
    }, 1500);

    function parse() {
      clearTimeout(fallback);
      var items = {};

      KEYS.forEach(function (k) {
        try {
          var v = window['hq_str_' + k];
          if (!v || typeof v !== 'string') return;
          var parts = v.split(',');
          var cfg = CFG[k];
          var price = parseFloat(parts[cfg.idx]);
          if (!price || isNaN(price)) return;

          var old = cache[k] ? cache[k].price : null;
          var change = (old !== null) ? price - old : 0;
          var pct = (old && old !== 0) ? ((change / old) * 100).toFixed(2) + '%' : null;

          items[k] = { price: price, prev: old, change: change, pct: pct };
        } catch (e) {}
      });

      if (KEYS.some(function (k) { return items[k]; })) {
        render(items);
      }
    }

    document.head.appendChild(script);
  }

  doFetch();
  setInterval(doFetch, 3000);

})();
