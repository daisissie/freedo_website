const DEFAULT_ZHENGRONG_BASE = 'http://36.170.54.6:24681';

function jsonHeaders(extraHeaders = {}) {
  return {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  };
}

export function allowMethods(request, methods) {
  if (methods.includes(request.method)) return null;

  return new Response(
    JSON.stringify({ error: `Method ${request.method} is not allowed.` }),
    {
      status: 405,
      headers: jsonHeaders({ Allow: methods.join(', ') }),
    }
  );
}

export function readZhengrongBase(context) {
  const raw =
    context?.env?.ZHENGRONG_BASE || process.env.ZHENGRONG_BASE || DEFAULT_ZHENGRONG_BASE;
  return String(raw).trim().replace(/\/+$/, '') || DEFAULT_ZHENGRONG_BASE;
}

export async function proxyZhengrong(context, pathname, options = {}) {
  return fetch(`${readZhengrongBase(context)}${pathname}`, options);
}

export async function relayJson(response) {
  const text = await response.text();

  if (!response.ok) {
    return new Response(
      JSON.stringify({ error: text || `Upstream error (${response.status}).` }),
      {
        status: response.status,
        headers: jsonHeaders(),
      }
    );
  }

  return new Response(text, {
    status: response.status,
    headers: jsonHeaders(),
  });
}

export async function relayBinaryOrJson(response, fallbackFilename = 'model.glb') {
  const contentType = response.headers.get('content-type') || '';

  if (!response.ok || contentType.includes('application/json') || contentType.startsWith('text/')) {
    return relayJson(response);
  }

  const bytes = await response.arrayBuffer();
  return new Response(bytes, {
    status: response.status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="${fallbackFilename}"`,
      'Content-Type': contentType || 'model/gltf-binary',
    },
  });
}

export function handleApiError(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;

  return new Response(
    JSON.stringify({ error: error?.message || 'Unexpected server error.' }),
    {
      status,
      headers: jsonHeaders(),
    }
  );
}
