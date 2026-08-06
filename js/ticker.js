/* ── 新浪财经 JSONP 实时行情条 ── */
(function () {
  var track = document.getElementById('ticker-track');
  if (!track) return;

  /* 符号配置：代码 → 标签 + 价格字段索引 */
  var CFG = {
    hf_XAU:       { label: 'XAUUSD',  idx: 0, dec: 2 },
    fx_seurusd:   { label: 'EURUSD',  idx: 1, dec: 4 },
    fx_sgbpusd:   { label: 'GBPUSD',  idx: 1, dec: 4 },
    fx_susdjpy:   { label: 'USDJPY',  idx: 1, dec: 3 },
    fx_susdcad:   { label: 'USDCAD',  idx: 1, dec: 4 }
  };

  var KEYS = Object.keys(CFG);
  var CACHE_KEY = 'tkr_sina_v1';
  var INTERVAL = 5000; /* 5 秒刷新 */
  var FETCHING = false;

  function loadCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveCache(d) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch (e) {}
  }

  var cache = loadCache();

  /* 构建滚动 HTML */
  function build(items) {
    var html = '';
    KEYS.forEach(function (k) {
      var d = items[k];
      if (!d) return;
      var cfg = CFG[k];
      var price = d.price, pre = d.prev, ch = d.change, pct = d.pct;
      var dir = ch >= 0 ? 'up' : 'down';
      var arrow = ch >= 0 ? '▲' : '▼';
      var chStr = (ch >= 0 ? '+' : '') + ch.toFixed(cfg.dec);

      var flashClass = '';
      if (pre !== null && pre !== price) flashClass = price > pre ? 'flash-up' : 'flash-down';

      html +=
        '<span class="tkr">' +
        '<span class="tkr-label">' + cfg.label + '</span>' +
        '<span class="tkr-price ' + dir + ' ' + flashClass + '">' + price.toFixed(cfg.dec) + '</span>' +
        '<span class="tkr-change ' + dir + '">' + arrow + ' ' + chStr + '</span>' +
        '<span class="tkr-pct ' + dir + '">' + (pct || '--') + '</span>' +
        '</span><span class="tkr-sep">◆</span>';
    });
    return html;
  }

  function render(items) {
    var inner = build(items);
    if (!inner) return;

    /* 暂停动画 → 更新内容 → 重启动画 */
    track.style.animation = 'none';
    track.innerHTML = inner + inner;
    track.offsetHeight; /* force reflow */
    track.style.animation = '';
    track.style.animation = 'scrollTicker 60s linear infinite';

    /* 更新缓存 */
    var toCache = {};
    KEYS.forEach(function (k) {
      if (items[k]) toCache[k] = { price: items[k].price };
    });
    saveCache(toCache);
  }

  /* JSONP 拉取 */
  function fetchData() {
    if (FETCHING) return;
    FETCHING = true;

    var script = document.createElement('script');
    var done = false;
    var timer = setTimeout(function () { cleanup(); }, 4000);

    function cleanup() {
      FETCHING = false;
      clearTimeout(timer);
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    script.src = 'https://hq.sinajs.cn/list=' + KEYS.join(',') + '&_=' + Date.now();
    script.onload = function () {
      done = true;
      cleanup();

      var items = {};

      KEYS.forEach(function (k) {
        var v = window['hq_str_' + k];
        if (!v) return;
        var parts = v.split(',');
        var cfg = CFG[k];
        var price = parseFloat(parts[cfg.idx]) || 0;
        if (!price) return;

        var prev = cache[k] ? cache[k].price : null;
        var change = (prev !== null) ? price - prev : 0;
        var pctVal = (prev && prev !== 0) ? ((change / prev) * 100).toFixed(2) + '%' : null;

        items[k] = { price: price, prev: prev, change: change, pct: pctVal };
      });

      if (KEYS.some(function (k) { return items[k]; })) {
        render(items);
        cache = loadCache(); /* 重新读取最新缓存 */
        /* 合并新数据到 cache */
        KEYS.forEach(function (k) {
          if (items[k]) cache[k] = { price: items[k].price };
        });
        saveCache(cache);
      }
    };

    script.onerror = function () {
      cleanup();
      /* 失败静默，保留上一次数据 */
    };

    document.head.appendChild(script);
  }

  /* 启动 */
  fetchData();
  setInterval(fetchData, INTERVAL);

})();
