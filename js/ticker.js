/* ── 策略研究日志 · 实时行情模块 ── */
(function () {
  'use strict';

  var ticker = document.getElementById('live-ticker');
  if (!ticker) return;

  var CACHE_KEY = 'sr_ticker_v2';

  function getCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return null;
  }

  function setCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }

  function updateDOM(id, label, data, prevData) {
    var el = document.getElementById(id);
    if (!el || !data) return;

    var price = data.price;
    var priceStr = typeof price === 'number' ? price.toFixed(2) : String(price);
    var change = typeof data.change === 'number' ? data.change : parseFloat(data.change) || 0;
    var dir = change >= 0 ? 'up' : 'down';
    var arrow = change >= 0 ? '&#9650;' : '&#9660;';
    var changeStr = (change >= 0 ? '+' : '') + change.toFixed(2);
    var pctStr = data.pct || '0.00%';

    var flashClass = '';
    if (prevData && prevData.price !== data.price) {
      flashClass = data.price > prevData.price ? 'flash-up' : 'flash-down';
    }

    el.innerHTML =
      '<span class="tkr-label">' + label + '</span>' +
      '<span class="tkr-price ' + dir + ' ' + flashClass + '">' + priceStr + '</span>' +
      '<span class="tkr-change ' + dir + '">' + arrow + ' ' + changeStr + '</span>' +
      '<span class="tkr-pct ' + dir + '">' + pctStr + '</span>';

    if (flashClass) {
      setTimeout(function () {
        var priceEl = el.querySelector('.tkr-price');
        if (priceEl) priceEl.classList.remove('flash-up', 'flash-down');
      }, 600);
    }
  }

  var prev = getCache();

  function tick() {
    fetch('/api/quotes')
      .then(function (resp) { return resp.json(); })
      .then(function (json) {
        if (json.error) return;
        var x = json.xau;
        var d = json.dxy;
        var newCache = { xau: x, dxy: d };
        updateDOM('tkr-xau', 'XAUUSD', x, prev ? prev.xau : null);
        updateDOM('tkr-dxy', 'DXY', d, prev ? prev.dxy : null);
        setCache(newCache);
        prev = newCache;
      })
      .catch(function () { /* 静默 */ });
  }

  if (prev) {
    updateDOM('tkr-xau', 'XAUUSD', prev.xau, null);
    updateDOM('tkr-dxy', 'DXY', prev.dxy, null);
  }

  tick();
  setInterval(tick, 15000);

})();
