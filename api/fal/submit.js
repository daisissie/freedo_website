import {
  allowMethods,
  getJsonBody,
  handleApiError,
  requireFiniteNumber,
  requireNonEmptyString,
  sendJson,
  submitTrellisJob,
} from '../_lib/fal.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;

  try {
    const body = await getJsonBody(req);
    const imageUrl = requireNonEmptyString(body.imageUrl, 'imageUrl');
    const payload = {
      image_url: imageUrl,
      resolution: requireFiniteNumber(body.resolution, 'resolution'),
      decimation_target: requireFiniteNumber(body.decimationTarget, 'decimationTarget'),
      texture_size: requireFiniteNumber(body.textureSize, 'textureSize'),
      ss_guidance_strength: requireFiniteNumber(body.ssGuidanceStrength, 'ssGuidanceStrength'),
      remesh: body.remesh !== false,
    };

    if (body.seed !== undefined && body.seed !== null && body.seed !== '') {
      payload.seed = requireFiniteNumber(body.seed, 'seed');
    }

    const job = await submitTrellisJob(payload);

    sendJson(res, 200, {
      requestId: job.request_id,
    });
  } catch (error) {
    handleApiError(res, error);
  }
}
