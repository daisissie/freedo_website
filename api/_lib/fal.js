const FAL_MODEL_ID = 'fal-ai/trellis-2';
const FAL_QUEUE_BASE = `https://queue.fal.run/${FAL_MODEL_ID}`;
const FAL_UPLOAD_URL = 'https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3';

function getFalKey() {
  const key = process.env.FAL_KEY;

  if (!key) {
    const error = new Error('Server is missing the FAL_KEY environment variable.');
    error.status = 500;
    throw error;
  }

  return key;
}

export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function allowMethods(req, res, methods) {
  if (methods.includes(req.method)) return true;

  res.setHeader('Allow', methods.join(', '));
  sendJson(res, 405, { error: `Method ${req.method} is not allowed.` });
  return false;
}

export async function getJsonBody(req) {
  if (req.body == null || req.body === '') return {};
  if (typeof req.body === 'object') return req.body;

  try {
    return JSON.parse(req.body);
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.status = 400;
    throw error;
  }
}

export function getQueryValue(req, key) {
  const raw = req.query?.[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

export function requireNonEmptyString(value, fieldName) {
  if (typeof value === 'string' && value.trim()) return value.trim();

  const error = new Error(`${fieldName} is required.`);
  error.status = 400;
  throw error;
}

export function requireFiniteNumber(value, fieldName) {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (Number.isFinite(parsed)) return parsed;

  const error = new Error(`${fieldName} must be a valid number.`);
  error.status = 400;
  throw error;
}

async function falJsonRequest(url, options, fallbackMessage) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options?.headers || {}),
      Authorization: `Key ${getFalKey()}`,
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
    const error = new Error(
      payload.detail || payload.error || payload.message || `${fallbackMessage} (${response.status})`
    );
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
}

export function handleApiError(res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const payload = { error: error?.message || 'Unexpected server error.' };

  if (error?.details) payload.details = error.details;

  sendJson(res, status, payload);
}

export async function createUploadSession({ fileName, contentType }) {
  return falJsonRequest(
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

export async function submitTrellisJob(payload) {
  return falJsonRequest(
    FAL_QUEUE_BASE,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'Queue submit failed'
  );
}

export async function fetchTrellisStatus(requestId) {
  return falJsonRequest(
    `${FAL_QUEUE_BASE}/requests/${encodeURIComponent(requestId)}/status`,
    { method: 'GET' },
    'Status check failed'
  );
}

export async function fetchTrellisResult(requestId) {
  return falJsonRequest(
    `${FAL_QUEUE_BASE}/requests/${encodeURIComponent(requestId)}`,
    { method: 'GET' },
    'Result fetch failed'
  );
}
