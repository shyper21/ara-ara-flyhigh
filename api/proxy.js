// ==========================================================
// VERCEL SERVERLESS PROXY (v2 - simple filename)
// File: /api/proxy.js
//
// Routing via vercel.json yang me-rewrite /api/* ke /api/proxy
// Forward request ke bot Railway, sembunyikan URL & API Key.
// ==========================================================

export default async function handler(req, res) {
  // Ambil env vars dari Vercel
  const BOT_URL = process.env.BOT_URL;
  const API_KEY = process.env.API_KEY;

  if (!BOT_URL || !API_KEY) {
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'BOT_URL or API_KEY env var not set in Vercel',
    });
  }

  // Parse path dari URL asli
  // req.url = "/api/status" atau "/api/watchlist/BBCA?xxx"
  // Kita perlu ambil bagian setelah /api
  const urlPath = req.url || '';
  const pathMatch = urlPath.match(/^\/api(\/.*)?$/);
  let apiPath = pathMatch ? (pathMatch[1] || '/') : '/';

  // Pisahkan query string
  const queryIndex = apiPath.indexOf('?');
  let queryString = '';
  if (queryIndex !== -1) {
    queryString = apiPath.substring(queryIndex);
    apiPath = apiPath.substring(0, queryIndex);
  }

  // Bangun target URL
  const targetUrl = `${BOT_URL.replace(/\/$/, '')}/api${apiPath}${queryString}`;

  // Siapkan body untuk POST/PUT/PATCH
  let body = undefined;
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  try {
    const botResponse = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: body,
    });

    // Coba parse sebagai JSON
    const text = await botResponse.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // Bukan JSON — kasih info debug
      return res.status(502).json({
        error: 'Bot returned non-JSON response',
        status: botResponse.status,
        preview: text.substring(0, 200),
        targetUrl: targetUrl.replace(BOT_URL, '[BOT_URL]'),
      });
    }

    return res.status(botResponse.status).json(data);
  } catch (error) {
    return res.status(502).json({
      error: 'Bot unreachable',
      message: error.message,
    });
  }
}
