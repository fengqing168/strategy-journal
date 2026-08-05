/* ── 策略研究日志 · 实时行情模块（国内可访问） ── */
(function () {
  'use strict';

  var ticker = document.getElementById('live-ticker');
  if (!ticker) return;

  var CACHE_KEY = 'sr_ticker_cache';

  function getCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { xau: null, dxy: null };
  }

  function setCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }

  function fetchPrice(uri) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      var callbackName = '_sr_cb_' + Math.random().toString(36).slice(2, 10);
      var timeout = setTimeout(function () {
        cleanup();
        reject(new Error('timeout'));
      }, 5000);

      function cleanup() {
        clearTimeout(timeout);
        if (script.parentNode) script.parentNode.removeChild(script);
        delete window[callbackName];
      }

      window[callbackName] = function (data) {
        cleanup();
        resolve(data);
      };

      script.src = uri + '&callback=' + callbackName;
      script.onerror = function () {
        cleanup();
        reject(new Error('network'));
      };
      document.head.appendChild(script);
    });
  }

  /* ── 数据源：新浪财经 JSONP（用户浏览器直连，不翻墙） ── */
  var SOURCES = {
    xau: 'https://hq.sinajs.cn/list=fx_sxauusd,fx_sxauusd',
    dxy: 'https://hq.sinajs.cn/list=fx_susdcnh'
  };

  function parseSina(str) {
    if (!str) return null;
    var parts = str.split(',');
    if (parts.length < 3) return null;
    return {
      price: parseFloat(parts[1]) || 0,
      change: parts[2] || '0',
      pct: parts[3] || '0%'
    };
  }

  function updateDOM(id, label, data, prevData) {
    var el = document.getElementById(id);
    if (!el || !data) return;

    var priceStr = data.price.toFixed(2);
    var changeNum = parseFloat(data.change);
    var dir = changeNum >= 0 ? 'up' : 'down';
    var arrow = changeNum >= 0 ? '&#9650;' : '&#9660;';
    var changeStr = (changeNum >= 0 ? '+' : '') + changeNum.toFixed(2);
    var pctStr = data.pct.indexOf('%') > -1 ? data.pct : data.pct + '%';

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
        if (priceEl) {
          priceEl.classList.remove('flash-up', 'flash-down');
        }
      }, 600);
    }
  }

  var prev = getCache();

  function tick() {
    Promise.allSettled([
      fetchPrice(SOURCES.xau).then(parseSina),
      fetchPrice(SOURCES.dxy).then(parseSina)
    ]).then(function (results) {
      var xau = results[0].status === 'fulfilled' ? results[0].value : null;
      var dxy = results[1].status === 'fulfilled' ? results[1].value : null;

      var newCache = { xau: xau, dxy: dxy };

      updateDOM('tkr-xau', 'XAUUSD', xau, prev.xau);
      updateDOM('tkr-dxy', 'DXY', dxy, prev.dxy);

      setCache(newCache);
      prev = newCache;
    }).catch(function () {
      /* 静默失败，保留上一次的价格 */
    });
  }

  /* 如果有缓存，先显示 */
  if (prev.xau) {
    updateDOM('tkr-xau', 'XAUUSD', prev.xau, null);
  }
  if (prev.dxy) {
    updateDOM('tkr-dxy', 'DXY', prev.dxy, null);
  }

  /* 首次拉取 */
  tick();

  /* 每 10 秒刷新 */
  setInterval(tick, 10000);

})();
