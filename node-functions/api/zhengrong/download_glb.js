const ZHENGRONG_BASE = 'http://36.170.54.6:24681';

export default async function onRequest(context) {
  if (context.request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'GET' },
    });
  }

  try {
    const url = new URL(context.request.url);
    const glb_job_id = url.searchParams.get('id');
    if (!glb_job_id) {
      return new Response(JSON.stringify({ error: 'Missing id parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const resp = await fetch(`${ZHENGRONG_BASE}/download_glb/${encodeURIComponent(glb_job_id)}`);

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(text, {
        status: resp.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const bytes = await resp.arrayBuffer();
    return new Response(bytes, {
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
