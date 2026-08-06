export async function onRequest(context) {
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
      hf_XAU:     { idx: 0 },
      fx_seurusd: { idx: 1 },
      fx_sgbpusd: { idx: 1 },
      fx_susdjpy: { idx: 1 },
      fx_susdcad: { idx: 1 },
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
      status: 502,
      headers,
    });
  }
}
