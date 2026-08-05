export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    /* /api/quotes → DXY 数据 */
    if (url.pathname === '/api/quotes') {
      const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=20'
      };

      try {
        const resp = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?range=1d&interval=1d');
        const json = await resp.json();
        const result = json.chart.result[0];
        const meta = result.meta;
        const price = meta.regularMarketPrice;
        const prev = meta.previousClose || meta.chartPreviousClose;
        const change = (price - prev).toFixed(4);
        const pct = prev ? ((change / prev) * 100).toFixed(2) + '%' : '0.00%';

        return new Response(JSON.stringify({
          dxy: { price, change: parseFloat(change), pct },
          ts: Date.now()
        }), { headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'unavailable', ts: Date.now() }), { headers });
      }
    }

    /* 其他请求 → 静态站点 */
    return env.ASSETS.fetch(request);
  }
};
