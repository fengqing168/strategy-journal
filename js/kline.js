/* ── 运行日志 · 双 K 线组件（预判图 + 验证图） ──
 * 依赖:../js/vendor/lightweight-charts.standalone.production.js
 *
 * 用法:在页面中放置 <div class="kline" data-end="2026-08-04">…
 *  - data-end      截止日期(判断段图):只画到这一天,证明"当时看到的是这个"
 *  - data-start    起始日期(验证段图):从这一天画起,显示行情后续如何走到目标
 *  - data-interval 周期:1d(默认,新浪日K) / 4h(东财4小时) / 1h(东财1小时)
 *  - data-title    图标题
 *  - data-mark     标注: 用 JSON 数组 [{price,label,color,style}]
 *  - data-hint     图底部一句话提示
 * 数据源:优先 /api/kline(worker 代理),失败回退本地 data/xau_daily_recent.json
 */
(function () {
  if (typeof LightweightCharts === "undefined") return;

  var API = "/api/kline?symbol=XAU&limit=400";
  var FALLBACK = "/data/xau_daily_recent.json";

  var C = {
    up: "#EF4444", down: "#10B981",
    text: "#949CB8", grid: "rgba(75,85,104,.12)",
    border: "rgba(75,85,104,.3)",
  };

  function normTime(t) {
    if (typeof t === "string" && t.length === 8) return t.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
    return t;
  }
  // 转 unix 秒用于区间比较（兼容字符串日期）
  function toTs(t) {
    if (typeof t === "number") return t;
    var s = String(t).length === 8 ? String(t).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3") : String(t);
    return Math.floor(new Date(s + "T00:00:00+08:00").getTime() / 1000);
  }

  function loadData(start, end, interval) {
    var params = ["interval=" + (interval || "1d")];
    if (start) params.push("start=" + start);
    if (end) params.push("end=" + end);
    var url = API + "&" + params.join("&");

    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error("api failed");
        return r.json();
      })
      .then(function (data) {
        if (!Array.isArray(data) || !data.length) throw new Error("empty");
        return data;
      })
      .catch(function () {
        return fetch(FALLBACK)
          .then(function (r) { return r.json(); })
          .then(function (data) {
            return data
              .filter(function (c) {
                return (!start || toTs(c.time) >= toTs(start)) && (!end || toTs(c.time) <= toTs(end));
              });
          });
      })
      .then(function (data) {
        return data.map(function (c) {
          var t = typeof c.time === "number" ? c.time : normTime(c.time);
          return { time: t, open: +c.open, high: +c.high, low: +c.low, close: +c.close };
        });
      });
  }

  function makeChart(el, interval) {
    var w = el.clientWidth || 720;
    var h = Math.round((w * 9) / 16);
    var intraday = interval === "4h" || interval === "1h";
    var chart = LightweightCharts.createChart(el, {
      width: w, height: h,
      layout: { background: { type: "solid", color: "transparent" }, textColor: C.text, fontSize: 11 },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderColor: C.border },
      timeScale: { borderColor: C.border, timeVisible: intraday, secondsVisible: false, rightOffset: 6 },
      crosshair: { mode: 0 },
      // 交互：拖拽平移 + 滚轮/双指缩放（lightweight-charts 内建，显式开启）
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
      localization: { timeFormatter: intraday ? function (t) { return new Date(t * 1000).toISOString().slice(0, 16).replace("T", " "); } : undefined },
    });
    var series = chart.addCandlestickSeries({
      upColor: C.up, downColor: C.down,
      borderUpColor: C.up, borderDownColor: C.down,
      wickUpColor: C.up, wickDownColor: C.down,
    });
    return { chart: chart, series: series };
  }

  function addMark(series, m) {
    series.createPriceLine({
      price: +m.price,
      color: m.color || C.text,
      lineWidth: 1,
      lineStyle: m.style === "solid" ? LightweightCharts.LineStyle.Solid : LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true,
      title: m.label || "",
    });
  }

  function init(el) {
    var start = el.getAttribute("data-start") || "";
    var end = el.getAttribute("data-end") || "";
    var markAttr = el.getAttribute("data-mark") || "[]";
    var marks = [];
    try { marks = JSON.parse(markAttr); } catch (e) {}

    var title = el.getAttribute("data-title") || "";
    var hint = el.getAttribute("data-hint") || "";
    var interval = el.getAttribute("data-interval") || "1d";

    var body = document.createElement("div");
    body.className = "kline-body";
    el.appendChild(body);

    if (title) {
      var t = document.createElement("div");
      t.className = "kline-title";
      t.textContent = title;
      el.insertBefore(t, body);
    }

    loadData(start, end, interval).then(function (data) {
      var g = makeChart(body, interval);
      g.series.setData(data);
      marks.forEach(function (m) { addMark(g.series, m); });
      g.chart.timeScale().fitContent();

      // 交互提示角标（非迷你图才显示，避免遮挡）
      var w = body.clientWidth || 720;
      if (w >= 360) {
        var nav = document.createElement("div");
        nav.className = "kline-nav";
        nav.textContent = "拖拽平移 · 滚轮/双指缩放";
        body.appendChild(nav);
      }

      if (marks.length) {
        var legend = document.createElement("div");
        legend.className = "kline-legend";
        marks.forEach(function (m) {
          var item = document.createElement("span");
          item.className = "kl-item";
          item.innerHTML =
            '<span class="kl-dot" style="background:' + m.color + '"></span>' +
            '<span class="kl-label">' + m.label + '</span>' +
            '<span class="kl-price">' + m.price + '</span>';
          legend.appendChild(item);
        });
        el.appendChild(legend);
      }

      if (hint) {
        var hintEl = document.createElement("div");
        hintEl.className = "kline-hint";
        hintEl.textContent = hint;
        el.appendChild(hintEl);
      }

      // 右下角来源标注（证明数据公开可核）
      var src = document.createElement("div");
      src.className = "kline-src";
      src.textContent = "数据源:SINA 日K · 可核验";
      el.appendChild(src);

      // resize
      var onResize = function () {
        var nw = body.clientWidth || 720;
        g.chart.applyOptions({ width: nw, height: Math.round((nw * 9) / 16) });
      };
      window.addEventListener("resize", onResize);
    });
  }

  var els = document.querySelectorAll(".kline");
  for (var i = 0; i < els.length; i++) init(els[i]);
})();
