const ZHENGRONG_BASE = 'http://36.170.54.6:24681';

export default async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
    });
  }

  try {
    const body = await context.request.text();

    const resp = await fetch(`${ZHENGRONG_BASE}/extract_glb`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return new Response(JSON.stringify({ error: text || `Upstream error ${resp.status}` }), {
        status: resp.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const buffer = await resp.arrayBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Content-Disposition': 'attachment; filename="model.glb"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Unexpected error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
