import {
  allowMethods,
  handleApiError,
  proxyZhengrong,
  relayBinaryOrJson,
} from '../../_lib/zhengrong.js';

export default async function onRequest(context) {
  const methodNotAllowed = allowMethods(context.request, ['GET', 'HEAD']);
  if (methodNotAllowed) return methodNotAllowed;

  try {
    const url = new URL(context.request.url);
    const glb_job_id = url.searchParams.get('id');
    if (!glb_job_id) {
      return new Response(JSON.stringify({ error: 'Missing id parameter' }), {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json; charset=utf-8',
        },
      });
    }

    const resp = await proxyZhengrong(
      context,
      `/download_glb/${encodeURIComponent(glb_job_id)}`
    );
    return relayBinaryOrJson(resp, `${glb_job_id}.glb`);
  } catch (error) {
    return handleApiError(error);
  }
}
