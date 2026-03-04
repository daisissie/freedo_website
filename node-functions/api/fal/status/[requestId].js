import {
  allowMethods,
  fetchTrellisStatus,
  getRequestId,
  handleApiError,
  sendJson,
} from '../../../_lib/fal.js';

export default async function onRequest(context) {
  const methodNotAllowed = allowMethods(context.request, ['GET']);
  if (methodNotAllowed) return methodNotAllowed;

  try {
    const requestId = getRequestId(context);
    const status = await fetchTrellisStatus(context, requestId);

    return sendJson(
      {
        status: status.status,
        queuePosition: status.queue_position ?? null,
        error: status.error || null,
      },
      200
    );
  } catch (error) {
    return handleApiError(error);
  }
}
