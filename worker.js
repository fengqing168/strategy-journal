/**
 * shujian.cc 后端 Worker
 *
 * API:
 *   /api/sina              — 行情代理（5品种实时）
 *   /api/kline             — 现货黄金日K代理（XAU，新浪源，可选 start/end/limit）
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

// ── K线缓存（按周期分 key，1d=新浪日K，4h=东财240分） ──
// 东财接口较重，缓存10分钟避免每次回源
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

// 清理 24 小时前的订单
function cleanup() {
  const cutoff = Date.now() - 86400000;
  for (const [id, o] of orders) {
    if (o.createdAt < cutoff) orders.delete(id);
  }
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

    // ── /api/sina ──
    if (path === "/api/sina") {
      try {
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
    // interval: 1d（默认，新浪日K）| 4h（东财240分）| 1h（东财60分）
    if (path === "/api/kline") {
      try {
        const symbol = url.searchParams.get("symbol") || "XAU";
        const interval = (url.searchParams.get("interval") || "1d").toLowerCase();
        const start = url.searchParams.get("start") || "";   // YYYY-MM-DD
        const end = url.searchParams.get("end") || "";       // YYYY-MM-DD
        const limit = parseInt(url.searchParams.get("limit") || "400", 10);

        // 10 分钟缓存 + 并发去重（按 interval 分 key）
        let candles = getCached(interval);
        if (!candles) {
          if (!klineInFlight.has(interval)) {
            const p = (async () => {
              if (interval === "1d") {
                // 新浪日K
                const sinaUrl = `https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20t=/GlobalFuturesService.getGlobalFuturesDailyKLine?symbol=${symbol}`;
                const resp = await fetch(sinaUrl);
                const text = await resp.text();
                const m = text.match(/\(\[(.*)\]\)/);
                if (!m) throw new Error("parse_failed");
                let list;
                try { list = JSON.parse("[" + m[1] + "]"); }
                catch (e) { throw new Error("parse_failed"); }
                return list.map((c) => ({ time: c.date, open: +c.open, high: +c.high, low: +c.low, close: +c.close }));
              }
              // 东财分钟/4H（klt: 240=4H, 60=1H）
              const klt = interval === "4h" ? "240" : interval === "1h" ? "60" : "240";
              const emUrl = `https://push2.eastmoney.com/api/qt/stock/kline/get?secid=122.XAU&klt=${klt}&fqt=1&end=20500101&lmt=800&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58`;
              const resp = await fetch(emUrl, { headers: { Referer: "https://quote.eastmoney.com/" } });
              const text = await resp.text();
              let j;
              try { j = JSON.parse(text); } catch (e) { throw new Error("parse_failed"); }
              const list = j && j.data && j.data.klines;
              if (!list || !list.length) throw new Error("parse_failed");
              // 东财 klines 格式: "2026-08-07 21:00,open,close,high,low,vol,..."
              return list.map((line) => {
                const p = line.split(",");
                const t = p[0].replace(" ", "T") + ":00+08:00";
                return { time: Math.floor(new Date(t).getTime() / 1000), open: +p[1], close: +p[2], high: +p[3], low: +p[4] };
              });
            })();
            klineInFlight.set(interval, p);
            p.finally(() => { klineInFlight.delete(interval); });
          }
          candles = await klineInFlight.get(interval);
          setCached(interval, candles);
        }

        // start/end 过滤（兼容 YYYY-MM-DD 与 unix 秒两种时间形态）
        const startTs = start ? Math.floor(new Date(start + "T00:00:00+08:00").getTime() / 1000) : 0;
        const endTs = end ? Math.floor(new Date(end + "T23:59:59+08:00").getTime() / 1000) : Infinity;
        const norm = (d) => d.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");

        let out = candles.filter((c) => {
          const ct = typeof c.time === "number" ? c.time : Math.floor(new Date(norm(c.time) + "T00:00:00+08:00").getTime() / 1000);
          return ct >= startTs && ct <= endTs;
        });
        if (limit > 0 && out.length > limit) out = out.slice(out.length - limit);

        return new Response(JSON.stringify(out), {
          headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=600", ...cors },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "unavailable" }), {
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
      return new Response(JSON.stringify({ ok: true, orders: orders.size, time: new Date().toISOString() }), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "Content-Type": "application/json", ...cors } });
  },
};
