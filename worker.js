/**
 * shujian.cc 后端 Worker
 * 部署方式：Cloudflare Dashboard → Workers → 创建 → 粘贴本文件 → 部署
 *           → 添加路由 shujian.cc/api/* → 绑定到此 Worker
 *
 * 路由：
 *   /api/sina              — 行情代理（5个品种实时数据）
 *   /api/token/generate    — 生成新 Token（需密码）
 *   /api/token/validate    — 验证 Token
 *   /api/ping                — 健康检查
 */

const SECRET = "xau-workflow-secret-2026-sheyuyoujian";
const ADMIN_PW = "xau2026twzd";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    
    // CORS headers
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
    
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // ── /api/sina · 行情代理 ──
    if (path === "/api/sina") {
      try {
        const sinaUrl = "https://hq.sinajs.cn/list=hf_XAU,fx_seurusd,fx_sgbpusd,fx_susdjpy,fx_susdcad";
        const resp = await fetch(sinaUrl, {
          headers: { Referer: "https://finance.sina.com.cn/" },
        });
        const text = await resp.text();

        const cfg = {
          hf_XAU:     { idx: 0 },
          fx_seurusd: { idx: 1 },
          fx_sgbpusd: { idx: 1 },
          fx_susdjpy: { idx: 1 },
          fx_susdcad: { idx: 1 },
        };

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
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=2",
            ...cors,
          },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "unavailable" }), {
          status: 502,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", ...cors },
        });
      }
    }

    // ── /api/token/validate ──
    if (path === "/api/token/validate") {
      const token = url.searchParams.get("token") || "";
      if (!token) {
        return new Response(JSON.stringify({ valid: false, reason: "missing" }), { headers: { "Content-Type": "application/json", ...cors } });
      }
      const parts = token.split(".");
      if (parts.length !== 2) {
        return new Response(JSON.stringify({ valid: false, reason: "format" }), { headers: { "Content-Type": "application/json", ...cors } });
      }
      const hash = parts[0].replace(/-/g, "+").replace(/_/g, "/");
      const ts = parts[1];
      
      // Validate HMAC
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sig = await crypto.subtle.sign("HMAC", key, enc.encode(ts));
      const expected = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/g, "");
      
      if (hash !== expected) {
        return new Response(JSON.stringify({ valid: false, reason: "invalid" }), { headers: { "Content-Type": "application/json", ...cors } });
      }
      
      const ageDays = (Date.now() - parseInt(ts)) / 86400000;
      if (ageDays > 90) {
        return new Response(JSON.stringify({ valid: false, reason: "expired", age: ageDays.toFixed(0) + "d" }), { headers: { "Content-Type": "application/json", ...cors } });
      }
      
      return new Response(JSON.stringify({ valid: true, age: ageDays.toFixed(0) + "d" }), { headers: { "Content-Type": "application/json", ...cors } });
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
      const token = hash + "." + ts;
      
      return new Response(JSON.stringify({ token, expires: "90 days", generated: new Date().toISOString() }), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    // ── /api/ping ──
    if (path === "/api/ping") {
      return new Response(JSON.stringify({ ok: true, time: new Date().toISOString() }), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    // ── 其他 → 404 ──
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...cors },
    });
  },
};
