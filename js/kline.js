/* ── 运行日志 · K 线组件 ──
 * 依赖:../js/vendor/lightweight-charts.standalone.production.js
 *
 * 用法:在页面中放置 <div class="kline">…
 *  - data-end        截止日期(判断段图):只画到这一天
 *  - data-start      起始日期(验证段图):从这一天画起
 *  - data-interval   单周期:1d/4h/1h
 *  - data-intervals  多周期堆叠(图里上下合并):如 "4h,1h"，中间隔开区分周期
 *  - data-title      图标题
 *  - data-mark       标注 JSON [{price,label,color,style}]
 *  - data-hint       图底部一句话提示
 * 数据源:/api/kline(worker→TradingView),失败回退本地 data/xau_daily_recent.json
 */
(function () {
  if (typeof LightweightCharts === "undefined") return;

  var API = "/api/kline?symbol=XAU&limit=500";
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

  // UTC 24 小时制 + 详细日期，例：2026/8/5 21:30
  function utcLabel(t) {
    var d = new Date(t * 1000);
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return (d.getUTCFullYear() + "/" + (d.getUTCMonth() + 1) + "/" + d.getUTCDate() +
      " " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + " UTC");
  }

  function loadData(start, end, interval, cut) {
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
        // 日内(4h/1h)不落到日线兜底：日线高/低会吞掉"观察位触及时"的定格语义。
        // 例如08/05日线 high=4267 已越过目标4250，错误地出现"到达目标的K线"。
        if (interval === "4h" || interval === "1h") throw new Error("intraday unavailable");
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
        return data
          .filter(function (c) {
            return (!cut || toTs(c.time) <= cut);
          })
          .map(function (c) {
            var t = typeof c.time === "number" ? c.time : normTime(c.time);
            return { time: t, open: +c.open, high: +c.high, low: +c.low, close: +c.close };
          });
      });
  }

  function makeChart(el, interval, heightRatio) {
    var w = el.clientWidth || 720;
    // 高比可定制：并排小图用更高比例(接近大图高度)，单图默认 16:9
    var ratio = heightRatio || (9 / 16);
    var h = Math.round(w * ratio);
    var intraday = interval === "4h" || interval === "1h";
    var chart = LightweightCharts.createChart(el, {
      width: w, height: h,
      layout: { background: { type: "solid", color: "transparent" }, textColor: C.text, fontSize: 11 },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderColor: C.border },
      timeScale: { borderColor: C.border, timeVisible: intraday, secondsVisible: false, rightOffset: 0 },
      crosshair: { mode: 0 },
      // 交互：拖拽平移 + 滚轮/双指缩放（lightweight-charts 内建，显式开启）
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
      localization: { timeFormatter: intraday ? function (t) { return utcLabel(t); } : undefined },
    });
    var series = chart.addCandlestickSeries({
      upColor: C.up, downColor: C.down,
      borderUpColor: C.up, borderDownColor: C.down,
      wickUpColor: C.up, wickDownColor: C.down,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    return { chart: chart, series: series };
  }

  // 标记线（止损/目标等贯穿线）：createPriceLine 负责右侧轴上的"标签文字+价格"，
  // 另加一条全透明 line series 占位，参与价格轴 autoscale，确保线默认可见。
  function addMark(chart, data, m) {
    chart.series.createPriceLine({
      price: +m.price,
      color: m.color || C.text,
      lineWidth: 1,
      lineStyle: m.style === "solid" ? LightweightCharts.LineStyle.Solid : LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true,
      title: m.label || "",
    });
    // 透明占位：把该价格纳入 autoscale，避免线低于数据低点被挤出画面
    var ghost = chart.chart.addLineSeries({
      color: "transparent",
      lineWidth: 1,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    ghost.setData([
      { time: data[0].time, value: +m.price },
      { time: data[data.length - 1].time, value: +m.price },
    ]);
  }

  // 水平射线：从进场时刻(由 m.from 指定)起，向右画一条线到图最右，
  // 用于区分观察位(=进场位)的大概进场时间。线段跨全部数据长度。
  function addRay(chart, data, m) {
    var from = m.from ? toTs(m.from) : data[0].time;
    var pts = [];
    for (var i = 0; i < data.length; i++) {
      if (data[i].time >= from) {
        pts.push({ time: data[i].time, value: +m.price });
      }
    }
    if (!pts.length) return null;
    var last = data[data.length - 1].time;
    var span = data.length > 1 ? (data[data.length - 1].time - data[0].time) / (data.length - 1) : 21600;
    var endTs = last + span * 30;
    pts.push({ time: endTs, value: +m.price });
    var ray = chart.chart.addLineSeries({
      color: m.color || C.text,
      lineWidth: 1,
      lineStyle: m.style === "solid" ? LightweightCharts.LineStyle.Solid : LightweightCharts.LineStyle.Dashed,
      crosshairMarkerVisible: false,
      lastValueVisible: true,
      priceLineVisible: false,
    });
    ray.setData(pts);
    return endTs;
  }

  // 渲染单个周期面板；heightRatio 用于并排小图默认对齐大图高度
  function renderPane(host, interval, start, end, marks, zoomBars, heightRatio, cut) {
    return loadData(start, end, interval, cut).then(function (data) {
      var body = document.createElement("div");
      body.className = "kline-body";
      host.appendChild(body);

      var g = makeChart(body, interval, heightRatio);
      g.series.setData(data);
      var rayEndTs = 0;
      marks.forEach(function (m) {
        if (m.ray) { var e = addRay(g, data, m); if (e) rayEndTs = Math.max(rayEndTs, e); }
        else { addMark(g, data, m); }
      });

      // 时间轴：聚焦最近，且把射线末点纳入可视区，让射线贴到右缘
      try {
        var lastIdx = data.length - 1;
        var fromIdx = zoomBars < data.length ? Math.max(0, lastIdx - zoomBars) : 0;
        var toIdx = lastIdx + 8;
        if (rayEndTs) {
          g.chart.timeScale().setVisibleRange({
            from: data[fromIdx].time,
            to: Math.max(data[lastIdx].time, rayEndTs),
          });
        } else {
          g.chart.timeScale().setVisibleLogicalRange({ from: fromIdx, to: toIdx });
        }
      } catch (e) {
        g.chart.timeScale().fitContent();
      }

      // 交互提示角标（居中，放大）
      var w = body.clientWidth || 720;
      if (w >= 360) {
        var nav = document.createElement("div");
        nav.className = "kline-nav";
        nav.textContent = "K线可拖拽平移 · 滚轮/双指缩放";
        body.appendChild(nav);
      }
      return g;
    });
  }

  function init(el) {
    var start = el.getAttribute("data-start") || "";
    var end = el.getAttribute("data-end") || "";
    var cut = el.getAttribute("data-cut") ? toTs(el.getAttribute("data-cut")) : null;
    var markAttr = el.getAttribute("data-mark") || "[]";
    var marks = [];
    try { marks = JSON.parse(markAttr); } catch (e) {}

    var title = el.getAttribute("data-title") || "";
    var hint = el.getAttribute("data-hint") || "";
    // 支持多周期堆叠:data-intervals="4h,1h"；否则单周期 data-interval
    var intervals = (el.getAttribute("data-intervals") || el.getAttribute("data-interval") || "1d")
      .split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var multi = intervals.length > 1;

    if (title) {
      var t = document.createElement("div");
      t.className = "kline-title";
      t.textContent = title;
      el.appendChild(t);
    }

    // 多周期：垂直堆叠，周期间用间隔区分
    var wrapper = document.createElement("div");
    wrapper.className = multi ? "kline-panes" : "";
    el.appendChild(wrapper);

    var charts = [];
    var pending = intervals.length;

    intervals.forEach(function (interval, idx) {
      var pane = document.createElement("div");
      pane.className = "kline-pane" + (multi ? " kline-pane-multi" : "");
      wrapper.appendChild(pane);

      if (multi) {
        var lbl = document.createElement("div");
        lbl.className = "kline-plabel";
        lbl.textContent = ivLabel(interval);
        pane.appendChild(lbl);
      }

      renderPane(pane, interval, start, end, marks, multi ? 56 : 90, chartRatio(multi), cut).then(function (g) {
        charts.push({ g: g, pane: pane, iv: interval, ratio: chartRatio(multi) });
        if (charts.length === pending) finish(el, charts, marks, hint);
      });
    });
  }

  function ivLabel(iv) {
    return { "4h": "4H", "1h": "1H", "1d": "1D" }[iv] || iv.toUpperCase();
  }

  // 高度比：单图大框 16:9；并排小图用 11:10 略高，使两框整体视觉对等
  function chartRatio(multi) {
    return multi ? 11 / 10 : 9 / 16;
  }

  function finish(el, charts, marks, hint) {
    var marks2 = marks || [];
    if (marks2.length) {
      var legend = document.createElement("div");
      legend.className = "kline-legend";
      marks2.forEach(function (m) {
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

    // 右下角来源标注
    var src = document.createElement("div");
    src.className = "kline-src";
    src.textContent = "数据源:TradingView · 可核验";
    el.appendChild(src);

    // resize
    var onResize = function () {
      charts.forEach(function (c) {
        var nw = c.pane.clientWidth || 720;
        c.g.chart.applyOptions({ width: nw, height: Math.round(nw * (c.ratio || 9 / 16)) });
      });
    };
    window.addEventListener("resize", onResize);
  }

  var els = document.querySelectorAll(".kline");
  for (var i = 0; i < els.length; i++) init(els[i]);
})();