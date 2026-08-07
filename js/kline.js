/* ── 运行日志 · 双 K 线组件（预判图 + 验证图） ──
 * 依赖:../js/vendor/lightweight-charts.standalone.production.js
 *
 * 用法:在页面中放置 <div class="kline" data-end="2026-08-04">…
 *  - data-end   截止日期(判断段图):只画到这一天,证明"当时看到的是这个"
 *  - data-start 起始日期(验证段图):从这一天画起,显示行情后续如何走到目标
 *  - data-title  图标题
 *  - data-mark   标注: 用 JSON 数组 [{price,label,color,style}]
 *  - data-hint   图底部一句话提示
 * 数据源:优先 /api/kline(worker 代理,新浪源),失败回退本地 data/xau_daily_recent.json
 */
(function () {
  if (typeof LightweightCharts === "undefined") return;

  var API = "/api/kline?symbol=XAU&limit=400";
  var FALLBACK = "/data/xau_daily_recent.json";

  var C = {
    up: "#34D399", down: "#F87171",
    text: "#949CB8", grid: "rgba(75,85,104,.12)",
    border: "rgba(75,85,104,.3)",
  };

  function normTime(t) {
    if (typeof t === "string" && t.length === 8) return t.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
    return t;
  }

  function loadData(start, end) {
    var params = [];
    if (start) params.push("start=" + start);
    if (end) params.push("end=" + end);
    var url = API + (params.length ? "&" + params.join("&") : "");

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
              .filter(function (c) { return (!start || normTime(c.time) >= normTime(start)) && (!end || normTime(c.time) <= normTime(end)); });
          });
      })
      .then(function (data) {
        return data.map(function (c) {
          return { time: normTime(c.time), open: +c.open, high: +c.high, low: +c.low, close: +c.close };
        });
      });
  }

  function makeChart(el) {
    var w = el.clientWidth || 720;
    var h = Math.round((w * 9) / 16);
    var chart = LightweightCharts.createChart(el, {
      width: w, height: h,
      layout: { background: { type: "solid", color: "transparent" }, textColor: C.text, fontSize: 11 },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderColor: C.border },
      timeScale: { borderColor: C.border, timeVisible: false, rightOffset: 6 },
      crosshair: { mode: 0 },
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

    var hintEl = document.createElement("div");
    hintEl.className = "kline-hint";
    hintEl.textContent = hint;
    el.appendChild(hintEl);

    var body = document.createElement("div");
    body.className = "kline-body";
    el.appendChild(body);

    loadData(start, end).then(function (data) {
      var g = makeChart(body);
      g.series.setData(data);
      marks.forEach(function (m) { addMark(g.series, m); });
      g.chart.timeScale().fitContent();

      // 右下角来源标注（证明数据公开可核）
      var src = document.createElement("div");
      src.className = "kline-src";
      src.textContent = "数据源:SINA 日K · 可核验";
      el.appendChild(src);

      if (title) {
        var t = document.createElement("div");
        t.className = "kline-title";
        t.textContent = title;
        el.insertBefore(t, body);
      }

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
