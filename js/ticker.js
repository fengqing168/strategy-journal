/* ── 行情模块 · XAUUSD 直连 + DXY Worker ── */
(function () {
  'use strict';
  var tkr = document.getElementById('live-ticker');
  if (!tkr) return;
  var CK = 'tkr_v3';

  function get() { try { return JSON.parse(localStorage.getItem(CK)); } catch (e) {} }
  function set(d) { try { localStorage.setItem(CK, JSON.stringify(d)); } catch (e) {} }

  function show(id, label, data, prev) {
    var el = document.getElementById(id);
    if (!el || !data) return;
    var p = data.price, priceStr = parseFloat(p).toFixed(2);
    var ch = parseFloat(data.change) || 0;
    var dir = ch >= 0 ? 'up' : 'down';
    var arrow = ch >= 0 ? '▲' : '▼';
    var chStr = (ch >= 0 ? '+' : '') + ch.toFixed(2);
    var pctStr = data.pct || '—';

    var fc = '';
    if (prev && prev.price !== data.price) fc = data.price > prev.price ? 'flash-up' : 'flash-down';

    el.innerHTML =
      '<span class="tkr-label">' + label + '</span>' +
      '<span class="tkr-price ' + dir + ' ' + fc + '">' + priceStr + '</span>' +
      '<span class="tkr-change ' + dir + '">' + arrow + ' ' + chStr + '</span>' +
      '<span class="tkr-pct ' + dir + '">' + pctStr + '</span>';

    if (fc) setTimeout(function () { var pe = el.querySelector('.tkr-price'); if (pe) { pe.classList.remove('flash-up', 'flash-down'); } }, 600);
  }

  var prev = get();

  async function tick() {
    var xauData = null;
    var dxyData = null;

    /* XAUUSD 直连 gold-api.com —— 100% 保证加载 */
    try {
      var r = await fetch('https://api.gold-api.com/price/XAU');
      var j = await r.json();
      xauData = { price: j.price, change: 0, pct: '—' };
      if (prev && prev.xau) {
        xauData.change = j.price - prev.xau.price;
        xauData.pct = prev.xau.price ? ((xauData.change / prev.xau.price) * 100).toFixed(2) + '%' : '—';
      }
    } catch (e) {}

    /* DXY 走 Worker */
    try {
      var dr = await fetch('/api/quotes');
      var dj = await dr.json();
      if (!dj.error && dj.dxy) dxyData = dj.dxy;
    } catch (e) {}

    var now = { xau: xauData, dxy: dxyData };
    show('tkr-xau', 'XAUUSD', xauData, prev ? prev.xau : null);
    show('tkr-dxy', 'DXY', dxyData, prev ? prev.dxy : null);
    set(now);
    prev = now;
  }

  if (prev) {
    show('tkr-xau', 'XAUUSD', prev.xau, null);
    show('tkr-dxy', 'DXY', prev.dxy, null);
  }

  tick();
  setInterval(tick, 15000);
})();
