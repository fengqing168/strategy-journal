export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/sina') {
      const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=2',
      };

      try {
        const sina =
          'https://hq.sinajs.cn/list=hf_XAU,fx_seurusd,fx_sgbpusd,fx_susdjpy,fx_susdcad';
        const resp = await fetch(sina, {
          headers: { Referer: 'https://finance.sina.com.cn/' },
        });
        const text = await resp.text();

        const cfg = {
          hf_XAU:     { label: 'XAUUSD', idx:  0, dec: 2 },
          fx_seurusd: { label: 'EURUSD', idx:  1, dec: 4 },
          fx_sgbpusd: { label: 'GBPUSD', idx:  1, dec: 4 },
          fx_susdjpy: { label: 'USDJPY', idx:  1, dec: 3 },
          fx_susdcad: { label: 'USDCAD', idx:  1, dec: 4 },
        };

        const result = {};
        const lines = text.split(';\n');
        for (const line of lines) {
          const m = line.match(/hq_str_(\w+)="(.+)"/);
          if (!m) continue;
          const key = m[1];
          const fields = m[2].split(',');
          const c = cfg[key];
          if (!c) continue;
          const price = parseFloat(fields[c.idx]);
          if (!isNaN(price)) result[key] = { price };
        }

        return new Response(JSON.stringify(result), { headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'unavailable' }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache',
          },
        });
      }
    }

    return env.ASSETS.fetch(request);
  },
};
