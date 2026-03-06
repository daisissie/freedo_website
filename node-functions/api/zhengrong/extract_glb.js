import {
  allowMethods,
  handleApiError,
  proxyZhengrong,
  relayBinaryOrJson,
} from '../../_lib/zhengrong.js';

export default async function onRequest(context) {
  const methodNotAllowed = allowMethods(context.request, ['POST']);
  if (methodNotAllowed) return methodNotAllowed;

  try {
    const body = await context.request.text();
    const resp = await proxyZhengrong(context, '/extract_glb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    return relayBinaryOrJson(resp);
  } catch (error) {
    return handleApiError(error);
  }
}
