self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname !== '/__sina') return;

  event.respondWith(
    (async () => {
      const sina = 'https://hq.sinajs.cn/list=hf_XAU,fx_seurusd,fx_sgbpusd,fx_susdjpy,fx_susdcad';
      const resp = await fetch(sina, {
        headers: { Referer: 'https://finance.sina.com.cn/' },
      });
      const text = await resp.text();
      return new Response(text, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=2',
        },
      });
    })()
  );
});
