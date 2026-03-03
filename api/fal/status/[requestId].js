import {
  allowMethods,
  fetchTrellisStatus,
  getQueryValue,
  handleApiError,
  requireNonEmptyString,
  sendJson,
} from '../../_lib/fal.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;

  try {
    const requestId = requireNonEmptyString(getQueryValue(req, 'requestId'), 'requestId');
    const status = await fetchTrellisStatus(requestId);

    sendJson(res, 200, {
      status: status.status,
      queuePosition: status.queue_position ?? null,
      error: status.error || null,
    });
  } catch (error) {
    handleApiError(res, error);
  }
}
