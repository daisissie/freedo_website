import {
  allowMethods,
  downloadTrellisGlb,
  getRequestId,
  handleApiError,
} from '../../../_lib/fal.js';

export default async function onRequest(context) {
  const methodNotAllowed = allowMethods(context.request, ['GET', 'HEAD']);
  if (methodNotAllowed) return methodNotAllowed;

  try {
    const requestId = getRequestId(context);
    const glb = await downloadTrellisGlb(context, requestId);
    const headers = {
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="${requestId}.glb"`,
      'Content-Type': glb.contentType,
    };

    if (glb.contentLength) {
      headers['Content-Length'] = glb.contentLength;
    }

    return new Response(glb.bytes, {
      status: 200,
      headers,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
