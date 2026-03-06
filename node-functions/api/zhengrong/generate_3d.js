const ZHENGRONG_BASE = 'http://36.170.54.6:24681';

export default async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
    });
  }

  try {
    // Pass raw body and Content-Type (including multipart boundary) straight through
    const contentType = context.request.headers.get('content-type') || '';
    const body = await context.request.arrayBuffer();

    const resp = await fetch(`${ZHENGRONG_BASE}/generate_3d`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
    });

    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Unexpected error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
