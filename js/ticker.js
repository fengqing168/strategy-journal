/* ── 实时行情（Worker 代理） ── */
(function () {
  var track = document.getElementById('ticker-track');
  if (!track) return;

  var CFG = {
    hf_XAU:      { label: 'XAUUSD', dec: 2 },
    fx_seurusd:  { label: 'EURUSD', dec: 4 },
    fx_sgbpusd:  { label: 'GBPUSD', dec: 4 },
    fx_susdjpy:  { label: 'USDJPY', dec: 3 },
    fx_susdcad:  { label: 'USDCAD', dec: 4 },
  };

  var KEYS = Object.keys(CFG);
  var CACHE_KEY = 'tkr_v7';
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
      var dir = (firstLoad || ch >= 0) ? 'up' : 'down';
      var arrow = firstLoad ? '' : (ch >= 0 ? '▲' : '▼');
      var chStr = firstLoad ? '' : ((ch >= 0 ? '+' : '') + ch.toFixed(cfg.dec));
      var flash = (!firstLoad && pre !== null && pre !== p) ? (p > pre ? 'flash-up' : 'flash-down') : '';

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
    // Just replace content — don't touch animation
    track.innerHTML = inner + inner;
    var toSave = {};
    KEYS.forEach(function (k) { if (items[k]) toSave[k] = { price: items[k].price }; });
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(toSave)); } catch (e) {}
    cache = items;
  }

  async function doFetch() {
    if (busy) return;
    busy = true;
    try {
      var resp = await fetch('/api/sina');
      if (!resp.ok) return;
      var data = await resp.json();

      var items = {};
      KEYS.forEach(function (k) {
        var p = data[k];
        if (!p || !p.price) return;
        var price = p.price;
        var old = cache[k] ? cache[k].price : null;
        var change = (old !== null) ? (price - old) : 0;
        items[k] = { price: price, prev: old, change: change };
      });

      if (KEYS.some(function (k) { return items[k]; })) {
        firstLoad = !Object.keys(cache).length;
        render(items);
        if (firstLoad) firstLoad = false;
      }
    } catch (e) { /* keep static fallback */ }
    busy = false;
  }

  doFetch();
  setInterval(doFetch, 3000);
})();
