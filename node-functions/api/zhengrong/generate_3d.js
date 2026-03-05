const ZHENGRONG_BASE = 'http://36.170.54.6:24681';

export default async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
    });
  }

  try {
    const formData = await context.request.formData();

    const resp = await fetch(`${ZHENGRONG_BASE}/generate_3d`, {
      method: 'POST',
      body: formData,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return new Response(JSON.stringify({ error: text || `Upstream error ${resp.status}` }), {
        status: resp.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await resp.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Unexpected error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
