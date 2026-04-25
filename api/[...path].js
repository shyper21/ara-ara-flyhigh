// ==========================================================
// VERCEL SERVERLESS PROXY
// File: /api/[...path].js
//
// Proxy semua request /api/* dari browser ke bot Railway.
// URL Railway + API Key disimpan di env vars server-side,
// tidak pernah terekspos ke browser.
// ==========================================================

export default async function handler(req, res) {
  // Ambil env vars dari Vercel (set di dashboard Vercel)
  const BOT_URL = process.env.BOT_URL;
  const API_KEY = process.env.API_KEY;

  // Validasi env vars ada
  if (!BOT_URL || !API_KEY) {
    return res.status(500).json({
      error: 'Server configuration error',
      message: 'BOT_URL or API_KEY env var not set in Vercel',
    });
  }

  // Ambil path dari URL (everything after /api/)
  // Vercel catch-all route [...path] akan kasih array
  const { path } = req.query;
  const pathArray = Array.isArray(path) ? path : (path ? [path] : []);
  const apiPath = '/' + pathArray.join('/');

  // Bangun target URL ke bot Railway
  // Contoh: /api/watchlist → ${BOT_URL}/api/watchlist
  const targetUrl = `${BOT_URL.replace(/\/$/, '')}/api${apiPath}`;

  // Forward query string (selain 'path' yang internal Vercel)
  const queryParams = { ...req.query };
  delete queryParams.path;
  const queryString = new URLSearchParams(queryParams).toString();
  const fullUrl = queryString ? `${targetUrl}?${queryString}` : targetUrl;

  // Siapkan request body (kalau POST/PUT/DELETE)
  let body = undefined;
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  try {
    // Forward request ke bot Railway dengan API Key di header
    const botResponse = await fetch(fullUrl, {
      method: req.method,
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: body,
    });

    // Ambil response dari bot
    const data = await botResponse.json().catch(() => ({
      error: 'Invalid JSON response from bot',
    }));

    // Kembalikan status + data ke browser
    return res.status(botResponse.status).json(data);
  } catch (error) {
    return res.status(502).json({
      error: 'Bot unreachable',
      message: error.message,
    });
  }
}
