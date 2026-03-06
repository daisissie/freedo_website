import {
  allowMethods,
  getJsonBody,
  handleApiError,
  requireFiniteNumber,
  requireNonEmptyString,
  sendJson,
  submitTrellisJob,
  uploadFileToFal,
} from '../../_lib/fal.js';

async function buildPayloadFromMultipart(context) {
  const form = await context.request.formData();
  const file = form.get('file');

  if (!file || typeof file.arrayBuffer !== 'function') {
    const error = new Error('file is required.');
    error.status = 400;
    throw error;
  }

  const imageUrl = await uploadFileToFal(context, file);
  const payload = {
    image_url: imageUrl,
    resolution: requireFiniteNumber(form.get('resolution'), 'resolution'),
    decimation_target: requireFiniteNumber(form.get('decimationTarget'), 'decimationTarget'),
    texture_size: requireFiniteNumber(form.get('textureSize'), 'textureSize'),
    ss_guidance_strength: requireFiniteNumber(
      form.get('ssGuidanceStrength'),
      'ssGuidanceStrength'
    ),
    remesh: form.get('remesh') !== 'false',
  };
  const seed = form.get('seed');

  if (seed !== null && seed !== undefined && String(seed).trim() !== '') {
    payload.seed = requireFiniteNumber(seed, 'seed');
  }

  return payload;
}

async function buildPayloadFromJson(context) {
  const body = await getJsonBody(context.request);
  const payload = {
    image_url: requireNonEmptyString(body.imageUrl, 'imageUrl'),
    resolution: requireFiniteNumber(body.resolution, 'resolution'),
    decimation_target: requireFiniteNumber(body.decimationTarget, 'decimationTarget'),
    texture_size: requireFiniteNumber(body.textureSize, 'textureSize'),
    ss_guidance_strength: requireFiniteNumber(
      body.ssGuidanceStrength,
      'ssGuidanceStrength'
    ),
    remesh: body.remesh !== false,
  };

  if (body.seed !== undefined && body.seed !== null && body.seed !== '') {
    payload.seed = requireFiniteNumber(body.seed, 'seed');
  }

  return payload;
}

export default async function onRequest(context) {
  const methodNotAllowed = allowMethods(context.request, ['POST']);
  if (methodNotAllowed) return methodNotAllowed;

  try {
    const contentType = context.request.headers.get('content-type') || '';
    const payload = contentType.includes('multipart/form-data')
      ? await buildPayloadFromMultipart(context)
      : await buildPayloadFromJson(context);
    const job = await submitTrellisJob(context, payload);

    return sendJson(
      {
        requestId: job.request_id,
      },
      200
    );
  } catch (error) {
    return handleApiError(error);
  }
}
