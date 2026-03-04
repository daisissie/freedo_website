const FAL_MODEL_ID = 'fal-ai/trellis-2';
const FAL_QUEUE_BASE = `https://queue.fal.run/${FAL_MODEL_ID}`;
const FAL_UPLOAD_URL = 'https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3';

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
    throw createHttpError(
      response.status,
      payload.detail || payload.error || payload.message || `${fallbackMessage} (${response.status})`,
      payload
    );
  }

  return payload;
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

export function handleApiError(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const payload = { error: error?.message || 'Unexpected server error.' };

  if (error?.details) {
    payload.details = error.details;
  }

  return sendJson(payload, status);
}
