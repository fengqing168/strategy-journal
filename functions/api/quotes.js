export async function onRequest(context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=20'
  };

  try {
    const dxyResp = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?range=1d&interval=1d');
    const dxyJson = await dxyResp.json();
    const dxyResult = dxyJson.chart.result[0];
    const dxyMeta = dxyResult.meta;
    const dxyPrice = dxyMeta.regularMarketPrice;
    const dxyPrev = dxyMeta.previousClose || dxyMeta.chartPreviousClose;
    const dxyChange = (dxyPrice - dxyPrev).toFixed(4);

    return new Response(JSON.stringify({
      dxy: {
        price: dxyPrice,
        change: parseFloat(dxyChange),
        pct: dxyPrev ? ((dxyChange / dxyPrev) * 100).toFixed(2) + '%' : '0.00%'
      },
      ts: Date.now()
    }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'unavailable', ts: Date.now() }), { headers });
  }
}
