/**
 * shujian.cc 后端 Worker
 *
 * API:
 *   /api/quote             — 实时报价（5品种，TradingView 同源，3秒缓存，新浪兜底）
 *   /api/sina              — 行情代理兜底（5品种实时，新浪源）
 *   /api/kline             — 现货黄金K线（XAUUSD，TradingView 源，统一 1d/4h/1h；可选 start/end/limit）
 *   /api/token/generate    — 生成 Token（需密码）
 *   /api/token/validate    — 验证 Token
 *   /api/order/create      — 创建待确认订单
 *   /api/order/list        — 列出待确认订单（需密码）
 *   /api/order/approve     — 确认订单 → 发放 Token（需密码）
 *   /api/order/status      — 查询订单状态
 *   /api/subscribe       — 订阅邮件 + 自动回复（需 RESEND_API_KEY）
 *   /api/ping                — 健康检查
 */

const SECRET = "xau-workflow-secret-2026-sheyuyoujian";
const ADMIN_PW = "xau2026twzd";
const TOKEN_DAYS = 90;

// 内存存储（Worker 重启时清空，适合低流量场景）
let orders = new Map();  // id → { email, ref, status, token, createdAt }

// ── K线缓存（按周期分 key，统一 TradingView 源） ──
const KLINE_CACHE_MS = 10 * 60 * 1000;
const klineCache = new Map();   // interval → { candles, at }
const klineInFlight = new Map();// interval → Promise（并发去重）

function getCached(interval) {
  const c = klineCache.get(interval);
  if (c && Date.now() - c.at < KLINE_CACHE_MS) return c.candles;
  return null;
}
function setCached(interval, candles) {
  klineCache.set(interval, { candles, at: Date.now() });
}

// ── 实时报价缓存（/api/quote，同源 TradingView） ──
const QUOTE_CACHE_MS = 3000;    // 3 秒缓存，避免每个访客都开 WS、也够"实时"
const quoteCache = new Map();   // symbolKey → { quotes, at }
const quoteInFlight = new Map();// symbolKey → Promise（并发去重）

// 品种映射：前端 ticker 的 key → TradingView symbol
const QUOTE_SYMBOLS = {
  hf_XAU:     "FX_IDC:XAUUSD",
  fx_seurusd: "FX_IDC:EURUSD",
  fx_sgbpusd: "FX_IDC:GBPUSD",
  fx_susdjpy: "FX_IDC:USDJPY",
  fx_susdcad: "FX_IDC:USDCAD",
};

function getQuoteCached() {
  for (const [, c] of quoteCache) {
    if (Date.now() - c.at < QUOTE_CACHE_MS) return c.quotes;
  }
  return null;
}

// 清理 24 小时前的订单
function cleanup() {
  const cutoff = Date.now() - 86400000;
  for (const [id, o] of orders) {
    if (o.createdAt < cutoff) orders.delete(id);
  }
}

// ── TradingView WebSocket 客户端（获取 XAUUSD K线） ──
// 协议参考开源 tvdatafeed：data.tradingview.com/socket.io/websocket
// 关键：Worker 出站 WS 用 fetch("https://...", {headers:{Upgrade:"websocket"}})：
//   - URL 必须用 https://（非 wss://），Cloudflare 自动升级为 WS
//   - fetch 方式可携带自定义 headers（TradingView 需要 Origin/UA）
const TV_URL = "https://data.tradingview.com/socket.io/websocket";
const TV_INTERVALS = { "1d": "1D", "4h": "4H", "1h": "1H" };

function tvPack(func, params) {
  const payload = JSON.stringify({ m: func, p: params });
  return `~m~${payload.length}~m~${payload}`;
}

async function tvFetchKline(interval, limit, symbol) {
  // 连接不稳定/被限流偶发握手失败 → 自动重试最多 3 次
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await tvFetchOnce(interval, limit, symbol);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// 取单品种实时价 = 最新一根 1h bar 的 close（未收线 bar 的 close 即当前实时价）
async function tvFetchQuote(symbol) {
  const candles = await tvFetchKline("1h", 2, symbol);
  const last = candles[candles.length - 1];
  if (!last) throw new Error("no_data:" + symbol);
  return { price: last.close, time: last.time };
}

// /api/quote 主逻辑：5 品种并发抓取，3 秒缓存 + 并发去重，新浪兜底
async function fetchQuotes() {
  let q = getQuoteCached();
  if (q) return q;

  const k = "all";
  if (!quoteInFlight.has(k)) {
    const p = (async () => {
      const entries = Object.entries(QUOTE_SYMBOLS);
      const results = await Promise.all(
        entries.map(async ([key, sym]) => {
          try {
            const out = await tvFetchQuoteWithRetry(sym);
            return [key, { price: out.price, time: out.time, src: "tv" }];
          } catch (e) {
            return null;
          }
        })
      );
      // 新浪兜底：补上 TV 失败的品种
      const sina = await fetchSinaRaw();
      const qMap = {};
      for (const r of results) if (r) qMap[r[0]] = r[1];
      for (const [key, r] of Object.entries(sina)) {
        if (!qMap[key]) qMap[key] = { price: r.price, src: "sina" };
      }
      return qMap;
    })();
    quoteInFlight.set(k, p);
    p.finally(() => quoteInFlight.delete(k));
    p.then((qMap) => { quoteCache.set(k, { quotes: qMap, at: Date.now() }); });
  }
  return quoteInFlight.get(k);
}

async function tvFetchQuoteWithRetry(symbol) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      return await tvFetchQuote(symbol);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

// 新浪原始报文（兜底用，结构与 /api/sina 相同解析）
async function fetchSinaRaw() {
  const sinaUrl = "https://hq.sinajs.cn/list=hf_XAU,fx_seurusd,fx_sgbpusd,fx_susdjpy,fx_susdcad";
  const resp = await fetch(sinaUrl, { headers: { Referer: "https://finance.sina.com.cn/" } });
  const text = await resp.text();
  const cfg = { hf_XAU: { idx: 0 }, fx_seurusd: { idx: 1 }, fx_sgbpusd: { idx: 1 }, fx_susdjpy: { idx: 1 }, fx_susdcad: { idx: 1 } };
  const result = {};
  for (const line of text.split(";")) {
    const m = line.match(/hq_str_(\w+)="(.+)"/);
    if (!m) continue;
    const key = m[1], fields = m[2].split(","), c = cfg[key];
    if (!c) continue;
    const price = parseFloat(fields[c.idx]);
    if (!isNaN(price)) result[key] = { price };
  }
  return result;
}

async function tvFetchOnce(interval, limit, symbolRaw) {
  const symbol = symbolRaw || "FX_IDC:XAUUSD";
  // 打开出站 WebSocket（https:// + Upgrade 头，可带自定义 headers）
  const resp = await fetch(TV_URL, {
    headers: {
      "Upgrade": "websocket",
      "Origin": "https://data.tradingview.com",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
  });
  if (!resp.webSocket) {
    const err = new Error("ws_handshake_failed:status_" + resp.status);
    err.debugInfo = { status: resp.status };
    throw err;
  }
  const ws = resp.webSocket;
  ws.accept();

  const session = "cs_" + Math.random().toString(36).slice(2, 12);
  const tvInterval = TV_INTERVALS[interval] || "1D";

  const result = await new Promise((resolve, reject) => {
    let raw = "";
    let settled = false;
    const finish = (fn, val) => { if (!settled) { settled = true; fn(val); } };
    const timer = setTimeout(() => finish(reject, new Error("timeout")), 15000);
    ws.addEventListener("message", (ev) => {
      if (settled) return;
      raw += ev.data + "\n";
      if (raw.includes("series_completed")) {
        clearTimeout(timer);
        finish(resolve, raw);
      }
    });
    ws.addEventListener("close", (ev) => { clearTimeout(timer); finish(reject, new Error("ws_closed:" + ev.code)); });
    ws.addEventListener("error", () => { clearTimeout(timer); finish(reject, new Error("ws_error")); });

    // 发送序列：鉴权 → 建会话 → 解析标的 → 建序列 → 切时区
    ws.send(tvPack("set_auth_token", ["unauthorized_user_token"]));
    ws.send(tvPack("chart_create_session", [session, ""]));
    ws.send(tvPack("resolve_symbol", [session, "symbol_1", '={"symbol":"' + symbol + '","adjustment":"splits","session":"regular"}']));
    ws.send(tvPack("create_series", [session, "s1", "s1", "symbol_1", tvInterval, limit]));
    ws.send(tvPack("switch_timezone", [session, "exchange"]));
  });

  // 解析 bars：真实结构为 {"s":[{"i":0,"v":[ts,o,h,l,c,vol]},...],"ns":...}
  const m = result.match(/"s":\[(.+?)\]\s*,"/);
  if (!m) throw new Error("parse_failed");
  const body = m[1];
  const candles = [];
  const re = /\{"i":\d+,"v":\[([^\]]+)\]\}/g;
  let mm;
  while ((mm = re.exec(body)) !== null) {
    const v = mm[1].split(",").map(Number);
    if (v.length >= 5 && !isNaN(v[0]) && !isNaN(v[1]) && !isNaN(v[2]) && !isNaN(v[3]) && !isNaN(v[4])) {
      candles.push({ time: v[0], open: v[1], high: v[2], low: v[3], close: v[4] });
    }
  }
  if (!candles.length) throw new Error("parse_failed");
  return candles;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // ── /api/quote ──
    // 实时报价：TradingView 同源（最新 1h 未收线 bar），3 秒缓存，新浪兜底
    if (path === "/api/quote") {
      try {
        const q = await fetchQuotes();
        return new Response(JSON.stringify(q), {
          headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3", ...cors },
        });
      } catch (e) {
        // 兜底失败才 502
        const sina = await fetchSinaRaw().catch(() => ({}));
        if (Object.keys(sina).length) {
          return new Response(JSON.stringify(sina), {
            headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=2", ...cors },
          });
        }
        return new Response(JSON.stringify({ error: "unavailable" }), {
          status: 502, headers: { "Content-Type": "application/json", ...cors },
        });
      }
    }

    // ── /api/sina ──（新浪兜底源，仍保留供 ticker 回退）
    if (path === "/api/sina") {
      try {
        const result = await fetchSinaRaw();
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=2", ...cors },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "unavailable" }), {
          status: 502, headers: { "Content-Type": "application/json", ...cors },
        });
      }
    }

    // ── /api/kline ──
    // interval: 1d（默认）| 4h | 1h —— 全部走 TradingView 统一数据源
    if (path === "/api/kline") {
      try {
        const symbol = url.searchParams.get("symbol") || "XAUUSD";
        const interval = (url.searchParams.get("interval") || "1d").toLowerCase();
        const start = url.searchParams.get("start") || "";   // YYYY-MM-DD
        const end = url.searchParams.get("end") || "";       // YYYY-MM-DD
        const limit = parseInt(url.searchParams.get("limit") || "400", 10);
        if (!TV_INTERVALS[interval]) {
          return new Response(JSON.stringify({ error: "unsupported_interval" }), {
            status: 400, headers: { "Content-Type": "application/json", ...cors },
          });
        }

        // 10 分钟缓存 + 并发去重（按 interval 分 key）
        let candles = getCached(interval);
        if (!candles) {
          if (!klineInFlight.has(interval)) {
            const p = tvFetchKline(interval, limit);
            klineInFlight.set(interval, p);
            p.finally(() => { klineInFlight.delete(interval); });
          }
          candles = await klineInFlight.get(interval);
          setCached(interval, candles);
        }

        // start/end 过滤（兼容 YYYY-MM-DD 与 unix 秒两种时间形态）
        const startTs = start ? Math.floor(new Date(start + "T00:00:00+08:00").getTime() / 1000) : 0;
        const endTs = end ? Math.floor(new Date(end + "T23:59:59+08:00").getTime() / 1000) : Infinity;

        let out = candles.filter((c) => {
          const ct = typeof c.time === "number" ? c.time : Math.floor(new Date(c.time.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3") + "T00:00:00+08:00").getTime() / 1000);
          return ct >= startTs && ct <= endTs;
        });
        if (limit > 0 && out.length > limit) out = out.slice(out.length - limit);

        return new Response(JSON.stringify(out), {
          headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=600", ...cors },
        });
      } catch (e) {
        const debug = url.searchParams.get("debug") === "1";
        const body = debug
          ? JSON.stringify({ error: "unavailable", reason: String(e && e.message || e), detail: (e && e.debugInfo) || undefined })
          : JSON.stringify({ error: "unavailable" });
        return new Response(body, {
          status: 502, headers: { "Content-Type": "application/json", ...cors },
        });
      }
    }

    // ── /api/token/generate ──
    if (path === "/api/token/generate") {
      const pw = url.searchParams.get("pw") || "";
      if (pw !== ADMIN_PW) {
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json", ...cors } });
      }
      const ts = Date.now().toString();
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sig = await crypto.subtle.sign("HMAC", key, enc.encode(ts));
      const hash = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
      return new Response(JSON.stringify({ token: hash + "." + ts, expires: TOKEN_DAYS + " days", generated: new Date().toISOString() }), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    // ── /api/token/validate ──
    if (path === "/api/token/validate") {
      const token = url.searchParams.get("token") || "";
      if (!token) return new Response(JSON.stringify({ valid: false, reason: "missing" }), { headers: { "Content-Type": "application/json", ...cors } });
      const parts = token.split(".");
      if (parts.length !== 2) return new Response(JSON.stringify({ valid: false, reason: "format" }), { headers: { "Content-Type": "application/json", ...cors } });
      const hash = parts[0].replace(/-/g, "+").replace(/_/g, "/");
      const ts = parts[1];
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sig = await crypto.subtle.sign("HMAC", key, enc.encode(ts));
      const expected = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/g, "");
      if (hash !== expected) return new Response(JSON.stringify({ valid: false, reason: "invalid" }), { headers: { "Content-Type": "application/json", ...cors } });
      const ageDays = (Date.now() - parseInt(ts)) / 86400000;
      if (ageDays > TOKEN_DAYS) return new Response(JSON.stringify({ valid: false, reason: "expired", age: ageDays.toFixed(0) + "d" }), { headers: { "Content-Type": "application/json", ...cors } });
      return new Response(JSON.stringify({ valid: true, age: ageDays.toFixed(0) + "d" }), { headers: { "Content-Type": "application/json", ...cors } });
    }

    // ── /api/order/create ──
    if (path === "/api/order/create" && request.method === "POST") {
      try {
        const body = await request.json();
        const email = (body.email || "").trim();
        if (!email || !email.includes("@")) {
          return new Response(JSON.stringify({ error: "invalid_email" }), { status: 400, headers: { "Content-Type": "application/json", ...cors } });
        }
        cleanup();
        const id = "ord-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
        const ref = "PAY-" + Date.now().toString().slice(-6);
        orders.set(id, {
          email,
          ref,
          status: "pending",
          token: null,
          createdAt: Date.now(),
        });
        return new Response(JSON.stringify({ id, ref, status: "pending" }), {
          headers: { "Content-Type": "application/json", ...cors },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "invalid_body" }), { status: 400, headers: { "Content-Type": "application/json", ...cors } });
      }
    }

    // ── /api/order/status ──
    if (path === "/api/order/status") {
      const id = url.searchParams.get("id") || "";
      const o = orders.get(id);
      if (!o) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "Content-Type": "application/json", ...cors } });
      return new Response(JSON.stringify({ id, status: o.status, token: o.token, email: o.email, ref: o.ref }), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    // ── /api/order/list ──
    if (path === "/api/order/list") {
      const pw = url.searchParams.get("pw") || "";
      if (pw !== ADMIN_PW) {
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json", ...cors } });
      }
      cleanup();
      const list = [];
      for (const [id, o] of orders) {
        list.push({ id, email: o.email, ref: o.ref, status: o.status, token: o.token, createdAt: new Date(o.createdAt).toISOString() });
      }
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return new Response(JSON.stringify(list), { headers: { "Content-Type": "application/json", ...cors } });
    }

    // ── /api/order/approve ──
    if (path === "/api/order/approve" && request.method === "POST") {
      let pw, id;
      try {
        const body = await request.json();
        pw = body.pw || "";
        id = body.id || "";
      } catch (e) {
        pw = url.searchParams.get("pw") || "";
        id = url.searchParams.get("id") || "";
      }
      if (pw !== ADMIN_PW) {
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json", ...cors } });
      }
      const o = orders.get(id);
      if (!o) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "Content-Type": "application/json", ...cors } });

      // Generate token
      const ts = Date.now().toString();
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sig = await crypto.subtle.sign("HMAC", key, enc.encode(ts));
      const hash = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
      const token = hash + "." + ts;

      o.status = "approved";
      o.token = token;
      orders.set(id, o);

      return new Response(JSON.stringify({ id, status: "approved", token, email: o.email }), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    // ── /api/subscribe ──
    if (path === "/api/subscribe" && request.method === "POST") {
      const RESEND_KEY = env.RESEND_API_KEY || "";
      if (!RESEND_KEY) {
        return new Response(JSON.stringify({ ok: true, note: "email_disabled" }), { headers: { "Content-Type": "application/json", ...cors } });
      }
      try {
        const body = await request.json();
        const email = (body.email || "").trim();
        if (!email || !email.includes("@")) {
          return new Response(JSON.stringify({ error: "invalid_email" }), { status: 400, headers: { "Content-Type": "application/json", ...cors } });
        }
        // Send welcome email via Resend
        const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#181C28;color:#F2F4FA;border-radius:12px">
<h2 style="color:#22D3EE">欢迎订阅策略研究周报</h2>
<p>每周日发送到你的邮箱，内容：</p>
<ul>
<li>本周最有价值的策略研究深度复盘</li>
<li>公开日志不写的完整 Prompt 和工具链优化细节</li>
<li>下周研究方向预告</li>
</ul>
<p>📂 <a href="https://shujian.cc/library.html" style="color:#22D3EE">策略研究知识库</a></p>
<p>🤖 <a href="https://shujian.cc/product.html" style="color:#22D3EE">AI 智能体工作流 · 16 Prompt</a></p>
<p style="font-size:12px;color:#949CB8;margin-top:24px">策略研究日志 · 舍予又见 · <a href="https://shujian.cc" style="color:#949CB8">shujian.cc</a></p>
</div>`;
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "策略研究日志 <noreply@shujian.cc>",
            to: email,
            subject: "欢迎订阅策略研究周报 · 舍予又见",
            html,
          }),
        });
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...cors } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: true, note: "email_send_failed" }), { headers: { "Content-Type": "application/json", ...cors } });
      }
    }

    // ── /api/ping ──
    if (path === "/api/ping") {
      return new Response(JSON.stringify({ ok: true, orders: orders.size, version: "tv-5-retry", time: new Date().toISOString() }), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "Content-Type": "application/json", ...cors } });
  },
};
