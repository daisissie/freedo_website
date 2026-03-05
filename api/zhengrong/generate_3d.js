const ZHENGRONG_BASE = 'http://36.170.54.6:24681';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const resp = await fetch(`${ZHENGRONG_BASE}/generate_3d`, {
      method: 'POST',
      headers: { 'content-type': req.headers['content-type'] },
      body: req,
      duplex: 'half',
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      res.statusCode = resp.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: text || `Upstream error ${resp.status}` }));
      return;
    }

    const data = await resp.json();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(data));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: error.message || 'Unexpected error' }));
  }
}
