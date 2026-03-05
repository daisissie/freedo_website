const ZHENGRONG_BASE = 'http://36.170.54.6:24681';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});

    const resp = await fetch(`${ZHENGRONG_BASE}/extract_glb`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      res.statusCode = resp.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: text || `Upstream error ${resp.status}` }));
      return;
    }

    const buffer = await resp.arrayBuffer();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('Content-Disposition', 'attachment; filename="model.glb"');
    res.setHeader('Cache-Control', 'no-store');
    res.end(Buffer.from(buffer));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: error.message || 'Unexpected error' }));
  }
}
