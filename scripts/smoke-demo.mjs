#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULTS = {
  base: 'http://localhost:5173',
  mode: 'quick',
  provider: 'both',
  timeoutSeconds: 180,
};

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    switch (token) {
      case '--base':
        options.base = next;
        index += 1;
        break;
      case '--mode':
        options.mode = next;
        index += 1;
        break;
      case '--provider':
        options.provider = next;
        index += 1;
        break;
      case '--image':
        options.image = next;
        index += 1;
        break;
      case '--timeout':
        options.timeoutSeconds = Number(next);
        index += 1;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  options.base = String(options.base || DEFAULTS.base).replace(/\/+$/, '');

  if (!['quick', 'full'].includes(options.mode)) {
    throw new Error(`Invalid --mode "${options.mode}". Use quick or full.`);
  }

  if (!['both', 'zhengrong', 'fal'].includes(options.provider)) {
    throw new Error(`Invalid --provider "${options.provider}". Use both, zhengrong, or fal.`);
  }

  if (!Number.isFinite(options.timeoutSeconds) || options.timeoutSeconds <= 0) {
    throw new Error('Invalid --timeout. Use a positive number of seconds.');
  }

  if (options.mode === 'full' && !options.image) {
    throw new Error('Full mode requires --image /absolute/or/relative/path/to/object-image.png');
  }

  return options;
}

function printUsage() {
  console.log(`Usage:
  npm run smoke:demo -- [--base URL] [--mode quick|full] [--provider both|zhengrong|fal] [--image PATH] [--timeout SECONDS]

Examples:
  npm run smoke:demo
  npm run smoke:demo -- --base https://your-domain.com
  npm run smoke:demo -- --mode full --image ./path/to/object.png
  npm run smoke:demo -- --base https://your-domain.com --mode full --provider fal --image ./object.png
`);
}

function logStep(type, message) {
  const prefix = {
    info: '[info]',
    pass: '[pass]',
    fail: '[fail]',
  }[type];
  console.log(`${prefix} ${message}`);
}

async function readJsonSafe(response) {
  return response.json().catch(() => null);
}

async function readTextSafe(response) {
  return response.text().catch(() => '');
}

async function getErrorMessage(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const payload = await readJsonSafe(response);
    if (payload?.error) return payload.error;
    if (payload?.message) return payload.message;
    return JSON.stringify(payload);
  }

  const text = await readTextSafe(response);
  return text || `${response.status} ${response.statusText}`;
}

async function request(url, init = {}, timeoutMs = 30000) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectOk(response, label) {
  if (response.ok) return;
  throw new Error(`${label}: ${await getErrorMessage(response)}`);
}

function shouldRun(providerArg, providerName) {
  return providerArg === 'both' || providerArg === providerName;
}

function inferContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

async function createFileFromPath(filePath) {
  const absolutePath = path.resolve(filePath);
  const buffer = await readFile(absolutePath);
  return new File([buffer], path.basename(absolutePath), {
    type: inferContentType(absolutePath),
  });
}

async function verifyDemoPage(base) {
  logStep('info', `Checking demo page at ${base}/demo.html`);
  const response = await request(`${base}/demo.html`, {}, 15000);
  expect(response.ok, `demo.html returned ${response.status}`);

  const html = await response.text();
  expect(html.includes('zhengrong-api-base'), 'demo.html is missing zhengrong-api-base meta.');
  expect(html.includes('fal-api-base'), 'demo.html is missing fal-api-base meta.');
  logStep('pass', 'demo.html is reachable.');
}

async function quickCheckZhengrong(base) {
  logStep('info', 'Quick-checking /api/zhengrong/* route mount');
  const response = await request(`${base}/api/zhengrong/download_glb`, {}, 15000);
  expect(response.status === 400, `Expected 400 from Zhengrong download route, got ${response.status}`);

  const payload = await readJsonSafe(response);
  expect(payload?.error?.includes('Missing id'), 'Unexpected Zhengrong route response.');
  logStep('pass', 'Zhengrong route is mounted.');
}

async function quickCheckFal(base) {
  logStep('info', 'Quick-checking /api/fal/* route mount');
  const response = await request(
    `${base}/api/fal/submit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
    15000
  );
  expect(response.status === 400, `Expected 400 from FAL submit route, got ${response.status}`);

  const payload = await readJsonSafe(response);
  expect(
    payload?.error?.includes('imageUrl') || payload?.error?.includes('file'),
    'Unexpected FAL route response.'
  );
  logStep('pass', 'FAL route is mounted.');
}

async function pollUntil({
  label,
  requestFactory,
  intervalMs,
  timeoutAt,
  onTick,
  isDone,
  isError,
}) {
  for (;;) {
    if (Date.now() > timeoutAt) {
      throw new Error(`${label} timed out.`);
    }

    const payload = await requestFactory();
    if (onTick) onTick(payload);
    if (isDone(payload)) return payload;
    if (isError(payload)) {
      throw new Error(payload.error || `${label} failed.`);
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

async function fullCheckZhengrong(base, file, timeoutAt) {
  logStep('info', 'Running full Zhengrong generate/export smoke test');

  const form = new FormData();
  form.append('file', file, file.name);

  const generateResponse = await request(
    `${base}/api/zhengrong/generate_3d`,
    { method: 'POST', body: form },
    60000
  );

  await expectOk(generateResponse, 'Zhengrong generate failed');
  const generated = await readJsonSafe(generateResponse);
  expect(generated, 'Zhengrong generate did not return JSON.');

  let state = generated.state;

  if (!state) {
    expect(generated.job_id, 'Zhengrong generate returned neither state nor job_id.');
    const polled = await pollUntil({
      label: 'Zhengrong job',
      intervalMs: 3000,
      timeoutAt,
      requestFactory: async () => {
        const response = await request(
          `${base}/api/zhengrong/job_status`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_id: generated.job_id }),
          },
          30000
        );
        await expectOk(response, 'Zhengrong job_status failed');
        return readJsonSafe(response);
      },
      onTick: payload => {
        logStep('info', `Zhengrong status: ${payload.status}`);
      },
      isDone: payload => payload?.status === 'done',
      isError: payload => payload?.status === 'error',
    });
    state = polled.state;
  }

  expect(state, 'Zhengrong did not return state.');

  const extractResponse = await request(
    `${base}/api/zhengrong/extract_glb`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    },
    60000
  );

  await expectOk(extractResponse, 'Zhengrong extract failed');
  const contentType = extractResponse.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const bytes = await extractResponse.arrayBuffer();
    expect(bytes.byteLength > 0, 'Zhengrong extract returned an empty GLB.');
    logStep('pass', `Zhengrong full test passed (${bytes.byteLength} bytes).`);
    return;
  }

  const extractPayload = await readJsonSafe(extractResponse);
  expect(extractPayload?.glb_job_id, 'Zhengrong extract did not return a GLB job id.');

  await pollUntil({
    label: 'Zhengrong GLB job',
    intervalMs: 4000,
    timeoutAt,
    requestFactory: async () => {
      const response = await request(
        `${base}/api/zhengrong/glb_status`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ glb_job_id: extractPayload.glb_job_id }),
        },
        30000
      );
      await expectOk(response, 'Zhengrong glb_status failed');
      return readJsonSafe(response);
    },
    onTick: payload => {
      logStep('info', `Zhengrong GLB status: ${payload.status}`);
    },
    isDone: payload => payload?.status === 'done',
    isError: payload => payload?.status === 'error',
  });

  const downloadResponse = await request(
    `${base}/api/zhengrong/download_glb?id=${encodeURIComponent(extractPayload.glb_job_id)}`,
    {},
    60000
  );

  await expectOk(downloadResponse, 'Zhengrong download failed');
  const bytes = await downloadResponse.arrayBuffer();
  expect(bytes.byteLength > 0, 'Zhengrong download returned an empty GLB.');
  logStep('pass', `Zhengrong full test passed (${bytes.byteLength} bytes).`);
}

async function fullCheckFal(base, file, timeoutAt) {
  logStep('info', 'Running full FAL generate/download smoke test');

  const form = new FormData();
  form.append('file', file, file.name);
  form.append('resolution', '1024');
  form.append('seed', '42');
  form.append('decimationTarget', '500000');
  form.append('textureSize', '2048');
  form.append('ssGuidanceStrength', '2.4');
  form.append('remesh', 'true');

  const submitResponse = await request(
    `${base}/api/fal/submit`,
    { method: 'POST', body: form },
    60000
  );

  await expectOk(submitResponse, 'FAL submit failed');
  const submitPayload = await readJsonSafe(submitResponse);
  expect(submitPayload?.requestId, 'FAL submit did not return requestId.');
  logStep('info', `FAL requestId: ${submitPayload.requestId}`);

  await pollUntil({
    label: 'FAL job',
    intervalMs: 2500,
    timeoutAt,
    requestFactory: async () => {
      const response = await request(
        `${base}/api/fal/status/${encodeURIComponent(submitPayload.requestId)}`,
        {},
        30000
      );
      await expectOk(response, 'FAL status failed');
      return readJsonSafe(response);
    },
    onTick: payload => {
      const queueInfo = payload.queuePosition == null ? '' : ` (queue ${payload.queuePosition})`;
      logStep('info', `FAL status: ${payload.status}${queueInfo}`);
    },
    isDone: payload => payload?.status === 'COMPLETED',
    isError: payload => payload?.status === 'FAILED',
  });

  const resultResponse = await request(
    `${base}/api/fal/result/${encodeURIComponent(submitPayload.requestId)}`,
    {},
    30000
  );
  await expectOk(resultResponse, 'FAL result failed');

  const resultPayload = await readJsonSafe(resultResponse);
  expect(resultPayload?.downloadUrl, 'FAL result did not return downloadUrl.');

  const downloadResponse = await request(`${base}${resultPayload.downloadUrl}`, {}, 60000);
  await expectOk(downloadResponse, 'FAL download failed');

  const contentType = downloadResponse.headers.get('content-type') || '';
  expect(!contentType.includes('application/json'), 'FAL download returned JSON instead of GLB.');

  const bytes = await downloadResponse.arrayBuffer();
  expect(bytes.byteLength > 0, 'FAL download returned an empty GLB.');
  logStep('pass', `FAL full test passed (${bytes.byteLength} bytes).`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  logStep(
    'info',
    `Smoke test starting: base=${options.base}, mode=${options.mode}, provider=${options.provider}`
  );

  await verifyDemoPage(options.base);

  if (shouldRun(options.provider, 'zhengrong')) {
    await quickCheckZhengrong(options.base);
  }

  if (shouldRun(options.provider, 'fal')) {
    await quickCheckFal(options.base);
  }

  if (options.mode === 'full') {
    const file = await createFileFromPath(options.image);
    const timeoutAt = Date.now() + options.timeoutSeconds * 1000;

    if (shouldRun(options.provider, 'zhengrong')) {
      await fullCheckZhengrong(options.base, file, timeoutAt);
    }

    if (shouldRun(options.provider, 'fal')) {
      await fullCheckFal(options.base, file, timeoutAt);
    }
  }

  logStep('pass', 'Smoke test finished successfully.');
}

main().catch(error => {
  logStep('fail', error.message || String(error));
  process.exitCode = 1;
});
