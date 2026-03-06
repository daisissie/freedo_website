import {
  allowMethods,
  getRequestId,
  handleApiError,
  resolveTrellisGlbUrl,
  sendJson,
} from '../../../_lib/fal.js';

export default async function onRequest(context) {
  const methodNotAllowed = allowMethods(context.request, ['GET']);
  if (methodNotAllowed) return methodNotAllowed;

  try {
    const requestId = getRequestId(context);
    await resolveTrellisGlbUrl(context, requestId);

    return sendJson({ downloadUrl: `/api/fal/download/${encodeURIComponent(requestId)}` }, 200);
  } catch (error) {
    return handleApiError(error);
  }
}
