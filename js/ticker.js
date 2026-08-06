/* ── 实时行情（免代理） ── */
(function () {
  var track = document.getElementById('ticker-track');
  if (!track) return;

  var CFG = {
    XAU: { label: 'XAUUSD', dec: 2, fx: false },
    EUR: { label: 'EURUSD', dec: 4, fx: true  },
    GBP: { label: 'GBPUSD', dec: 4, fx: true  },
    JPY: { label: 'USDJPY', dec: 3, fx: false },
    CAD: { label: 'USDCAD', dec: 4, fx: false },
  };

  var KEYS = Object.keys(CFG);
  var CACHE_KEY = 'tkr_v5';
  var busy = false;
  var cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) {}

  var fxCache = null;        /* { rates:{...}, ts } */

  function buildHTML(items) {
    var h = '';
    KEYS.forEach(function (k) {
      var d = items[k];
      if (!d) return;
      var cfg = CFG[k];
      var p = d.price, pre = d.prev, ch = d.change, pct = d.pct || '--';
      var dir = (ch === 1e9 || ch >= 0) ? 'up' : 'down';
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
    track.innerHTML = inner + inner;
    var toSave = {};
    KEYS.forEach(function (k) { if (items[k]) toSave[k] = { price: items[k].price }; });
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(toSave)); } catch (e) {}
    cache = items;
  }

  function mergeItems(fresh) {
    var items = {};
    KEYS.forEach(function (k) {
      var price = fresh[k];
      if (!price) return;
      var old = cache[k] ? cache[k].price : null;
      var change = (old !== null) ? (price - old) : 1e9;
      var pct = (old && old !== 0) ? ((change / old) * 100).toFixed(2) + '%' : null;
      items[k] = { price: price, prev: old, change: change, pct: pct };
    });
    if (KEYS.some(function (k) { return items[k]; })) render(items);
  }

  /* ── 黄金：每 3s ── */
  async function fetchGold() {
    try {
      var resp = await fetch('https://api.gold-api.com/price/XAU');
      if (!resp.ok) return;
      var j = await resp.json();
      if (j.price) mergeItems({ XAU: j.price });
    } catch (e) {}
  }

  /* ── 外汇：缓存在内存中 ── */
  async function fetchForex() {
    try {
      var resp = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!resp.ok) return;
      var j = await resp.json();
      var r = j.rates;
      if (!r) return;
      var fresh = {};
      if (r.EUR) fresh.EUR = 1 / r.EUR;
      if (r.GBP) fresh.GBP = 1 / r.GBP;
      if (r.JPY) fresh.JPY = r.JPY;
      if (r.CAD) fresh.CAD = r.CAD;
      mergeItems(fresh);
      fxCache = { ts: Date.now() };
    } catch (e) {}
  }

  function tick() {
    fetchGold();
    if (!fxCache || (Date.now() - fxCache.ts) > 3600000) fetchForex();
  }

  tick();
  setInterval(tick, 3000);
})();
