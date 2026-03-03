import {
  allowMethods,
  fetchTrellisResult,
  getQueryValue,
  handleApiError,
  requireNonEmptyString,
  sendJson,
} from '../../_lib/fal.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;

  try {
    const requestId = requireNonEmptyString(getQueryValue(req, 'requestId'), 'requestId');
    const result = await fetchTrellisResult(requestId);
    const glbUrl = result?.model_glb?.url;

    if (!glbUrl) {
      const error = new Error('fal response did not include model_glb.url.');
      error.status = 502;
      error.details = result;
      throw error;
    }

    sendJson(res, 200, { glbUrl });
  } catch (error) {
    handleApiError(res, error);
  }
}
