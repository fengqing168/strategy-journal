export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=15'
  };

  async function fetchYahoo(symbol) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1d`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Yahoo ${symbol} failed`);
    const json = await resp.json();
    const result = json.chart.result[0];
    const meta = result.meta;
    return {
      price: meta.regularMarketPrice,
      prevClose: meta.previousClose || meta.chartPreviousClose,
      change: (meta.regularMarketPrice - (meta.previousClose || meta.chartPreviousClose)).toFixed(4),
    };
  }

  try {
    const [xau, dxy] = await Promise.all([
      fetchYahoo('GC=F'),
      fetchYahoo('DX-Y.NYB')
    ]);

    const data = {
      xau: {
        price: xau.price,
        change: parseFloat(xau.change),
        pct: xau.prevClose ? ((xau.change / xau.prevClose) * 100).toFixed(2) + '%' : '0.00%',
        prevClose: xau.prevClose
      },
      dxy: {
        price: dxy.price,
        change: parseFloat(dxy.change),
        pct: dxy.prevClose ? ((dxy.change / dxy.prevClose) * 100).toFixed(2) + '%' : '0.00%',
        prevClose: dxy.prevClose
      },
      ts: Date.now()
    };

    return new Response(JSON.stringify(data), { headers });
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'unavailable',
      ts: Date.now()
    }), { status: 200, headers });
  }
}
