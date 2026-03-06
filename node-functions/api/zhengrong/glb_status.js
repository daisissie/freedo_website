import {
  allowMethods,
  handleApiError,
  proxyZhengrong,
  relayJson,
} from '../../_lib/zhengrong.js';

export default async function onRequest(context) {
  const methodNotAllowed = allowMethods(context.request, ['POST']);
  if (methodNotAllowed) return methodNotAllowed;

  try {
    const body = await context.request.text();
    const resp = await proxyZhengrong(context, '/glb_status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    return relayJson(resp);
  } catch (error) {
    return handleApiError(error);
  }
}
