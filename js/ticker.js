/* ── 滚动行情条 · 多品种实时报价 ── */
(function () {
  var track = document.getElementById('ticker-track');
  if (!track) return;

  var symbols = [
    { id: 'xau', label: 'XAUUSD', src: 'gold' },
    { id: 'eur', label: 'EURUSD', src: 'forex', calc: function (r) { return (1 / r.EUR).toFixed(4); } },
    { id: 'gbp', label: 'GBPUSD', src: 'forex', calc: function (r) { return (1 / r.GBP).toFixed(4); } },
    { id: 'jpy', label: 'USDJPY', src: 'forex', calc: function (r) { return r.JPY.toFixed(3); } },
    { id: 'cad', label: 'USDCAD', src: 'forex', calc: function (r) { return r.CAD.toFixed(4); } },
    { id: 'dxy', label: 'DXY', src: 'worker' }
  ];

  var data = {};
  var prevData = {};

  function fmtNum(v, dec) { return parseFloat(v).toFixed(dec); }

  function buildTrack() {
    var items = [];
    symbols.forEach(function (s) {
      var d = data[s.id];
      if (!d) return;
      var price = d.price, change = d.change || 0, pct = d.pct || '--';
      var dir = change >= 0 ? 'up' : 'down';
      var arrow = change >= 0 ? '▲' : '▼';
      var chStr = (change >= 0 ? '+' : '') + change.toFixed(s.label.indexOf('JPY') > -1 ? 3 : 4);

      var prev = prevData[s.id];
      var flashClass = '';
      if (prev && prev.price !== price) {
        flashClass = price > prev.price ? 'flash-up' : 'flash-down';
      }

      items.push(
        '<span class="tkr">' +
        '<span class="tkr-label">' + s.label + '</span>' +
        '<span class="tkr-price ' + dir + ' ' + flashClass + '">' + fmtNum(price, s.label.indexOf('JPY') > -1 ? 3 : 2) + '</span>' +
        '<span class="tkr-change ' + dir + '">' + arrow + ' ' + chStr + '</span>' +
        '<span class="tkr-pct ' + dir + '">' + pct + '</span>' +
        '</span><span class="tkr-sep">◆</span>'
      );
    });
    return items.join('');
  }

  function render() {
    var inner = buildTrack();
    if (!inner) return;
    track.innerHTML = inner + inner; /* 双份 — 无缝循环 */
    prevData = JSON.parse(JSON.stringify(data));
  }

  async function fetchAll() {
    var results = {};

    /* XAUUSD 直连 */
    try {
      var r = await fetch('https://api.gold-api.com/price/XAU');
      var j = await r.json();
      results.xau = { price: j.price, change: 0 };
      if (prevData.xau) results.xau.change = j.price - prevData.xau.price;
    } catch (e) { results.xau = prevData.xau; }

    /* 外汇 直连 */
    try {
      var fr = await fetch('https://open.er-api.com/v6/latest/USD');
      var fj = await fr.json();
      var rates = fj.rates;

      var eurPrice = 1 / rates.EUR;
      var gbpPrice = 1 / rates.GBP;
      var jpyPrice = rates.JPY;
      var cadPrice = rates.CAD;

      results.eur = { price: eurPrice, change: prevData.eur ? eurPrice - prevData.eur.price : 0 };
      results.gbp = { price: gbpPrice, change: prevData.gbp ? gbpPrice - prevData.gbp.price : 0 };
      results.jpy = { price: jpyPrice, change: prevData.jpy ? jpyPrice - prevData.jpy.price : 0 };
      results.cad = { price: cadPrice, change: prevData.cad ? cadPrice - prevData.cad.price : 0 };
    } catch (e) {
      results.eur = prevData.eur;
      results.gbp = prevData.gbp;
      results.jpy = prevData.jpy;
      results.cad = prevData.cad;
    }

    /* DXY 走 Worker */
    try {
      var dr = await fetch('/api/quotes');
      var dj = await dr.json();
      if (!dj.error && dj.dxy) results.dxy = dj.dxy;
    } catch (e) { results.dxy = prevData.dxy; }

    /* 计算涨跌幅 */
    ['xau', 'eur', 'gbp', 'jpy', 'cad', 'dxy'].forEach(function (id) {
      var d = results[id];
      if (!d) return;
      var prev = prevData[id];
      if (prev && prev.price) {
        d.change = d.price - prev.price;
        d.pct = ((d.change / prev.price) * 100).toFixed(2) + '%';
      } else {
        d.pct = '--';
      }
    });

    data = results;
    render();
  }

  fetchAll();
  setInterval(fetchAll, 10000);

})();
