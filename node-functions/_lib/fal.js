const FAL_MODEL_ID = 'fal-ai/trellis-2';
const FAL_QUEUE_BASE = `https://queue.fal.run/${FAL_MODEL_ID}`;
const FAL_UPLOAD_URL = 'https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3';
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function jsonHeaders() {
  return {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function createHttpError(status, message, details) {
  const error = new Error(message);
  error.status = status;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

function normalizeFalErrorMessage(candidate) {
  if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();

  if (Array.isArray(candidate)) {
    const nested = candidate
      .map(item => normalizeFalErrorMessage(item))
      .find(Boolean);
    if (nested) return nested;
  }

  if (candidate && typeof candidate === 'object') {
    return (
      normalizeFalErrorMessage(candidate.message) ||
      normalizeFalErrorMessage(candidate.msg) ||
      normalizeFalErrorMessage(candidate.error) ||
      normalizeFalErrorMessage(candidate.detail)
    );
  }

  return '';
}

function readFalKey(context) {
  const raw = context?.env?.FAL_KEY || process.env.FAL_KEY || '';
  const key = String(raw).trim();

  if (!key) {
    throw createHttpError(500, 'Server is missing the FAL_KEY environment variable.');
  }

  return key;
}

export function sendJson(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders(),
  });
}

export function allowMethods(request, methods) {
  if (methods.includes(request.method)) return null;

  return new Response(
    JSON.stringify({ error: `Method ${request.method} is not allowed.` }),
    {
      status: 405,
      headers: {
        ...jsonHeaders(),
        Allow: methods.join(', '),
      },
    }
  );
}

export async function getJsonBody(request) {
  const text = await request.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw createHttpError(400, 'Request body must be valid JSON.');
  }
}

export function requireNonEmptyString(value, fieldName) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw createHttpError(400, `${fieldName} is required.`);
}

export function requireFiniteNumber(value, fieldName) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(parsed)) return parsed;
  throw createHttpError(400, `${fieldName} must be a valid number.`);
}

export function getRequestId(context) {
  const pathValue = context?.params?.requestId;

  if (typeof pathValue === 'string' && pathValue.trim()) {
    return pathValue.trim();
  }

  const queryValue = new URL(context.request.url).searchParams.get('requestId');
  return requireNonEmptyString(queryValue, 'requestId');
}

async function falJsonRequest(context, url, options, fallbackMessage) {
  let lastError;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...(options?.headers || {}),
          Authorization: `Key ${readFalKey(context)}`,
        },
      });

      const text = await response.text();
      let payload = {};

      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = { raw: text };
        }
      }

      if (!response.ok) {
        const message =
          normalizeFalErrorMessage(payload?.detail) ||
          normalizeFalErrorMessage(payload?.error) ||
          normalizeFalErrorMessage(payload?.message) ||
          `${fallbackMessage} (${response.status})`;

        if (attempt < 2 && RETRYABLE_STATUS_CODES.has(response.status)) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }

        throw createHttpError(response.status, message, payload);
      }

      return payload;
    } catch (error) {
      lastError = error;
      if (attempt >= 2 || Number.isInteger(error?.status)) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  throw lastError || createHttpError(500, fallbackMessage);
}

export async function createUploadSession(context, { fileName, contentType }) {
  return falJsonRequest(
    context,
    FAL_UPLOAD_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_name: fileName,
        content_type: contentType,
      }),
    },
    'Upload init failed'
  );
}

export async function uploadFileToFal(context, file) {
  const fileName = requireNonEmptyString(file?.name || '', 'file');
  const contentType = requireNonEmptyString(
    file?.type || 'application/octet-stream',
    'contentType'
  );

  const upload = await createUploadSession(context, { fileName, contentType });
  const uploadResponse = await fetch(upload.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: await file.arrayBuffer(),
  });

  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => '');
    throw createHttpError(
      uploadResponse.status,
      detail || `File upload failed (${uploadResponse.status}).`
    );
  }

  return upload.file_url;
}

export async function submitTrellisJob(context, payload) {
  return falJsonRequest(
    context,
    FAL_QUEUE_BASE,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Queue submit failed'
  );
}

export async function fetchTrellisStatus(context, requestId) {
  return falJsonRequest(
    context,
    `${FAL_QUEUE_BASE}/requests/${encodeURIComponent(requestId)}/status`,
    { method: 'GET' },
    'Status check failed'
  );
}

export async function fetchTrellisResult(context, requestId) {
  return falJsonRequest(
    context,
    `${FAL_QUEUE_BASE}/requests/${encodeURIComponent(requestId)}`,
    { method: 'GET' },
    'Result fetch failed'
  );
}

export async function resolveTrellisGlbUrl(context, requestId) {
  const result = await fetchTrellisResult(context, requestId);
  const glbUrl = result?.model_glb?.url;

  if (!glbUrl) {
    throw createHttpError(502, 'fal response did not include model_glb.url.', result);
  }

  return glbUrl;
}

export async function downloadTrellisGlb(context, requestId) {
  const glbUrl = await resolveTrellisGlbUrl(context, requestId);
  const response = await fetch(glbUrl);

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw createHttpError(
      response.status,
      detail || `GLB download failed (${response.status}).`
    );
  }

  return {
    bytes: await response.arrayBuffer(),
    contentType: response.headers.get('content-type') || 'model/gltf-binary',
    contentLength: response.headers.get('content-length') || '',
  };
}

export function handleApiError(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const payload = { error: error?.message || 'Unexpected server error.' };

  if (error?.details) {
    payload.details = error.details;
  }

  return sendJson(payload, status);
}
