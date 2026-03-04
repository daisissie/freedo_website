import {
  allowMethods,
  fetchTrellisResult,
  getRequestId,
  handleApiError,
  sendJson,
} from '../../../_lib/fal.js';

export default async function onRequest(context) {
  const methodNotAllowed = allowMethods(context.request, ['GET']);
  if (methodNotAllowed) return methodNotAllowed;

  try {
    const requestId = getRequestId(context);
    const result = await fetchTrellisResult(context, requestId);
    const glbUrl = result?.model_glb?.url;

    if (!glbUrl) {
      const error = new Error('fal response did not include model_glb.url.');
      error.status = 502;
      error.details = result;
      throw error;
    }

    return sendJson({ glbUrl }, 200);
  } catch (error) {
    return handleApiError(error);
  }
}
