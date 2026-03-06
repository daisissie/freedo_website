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
    const incomingForm = await context.request.formData();
    const upstreamForm = new FormData();

    for (const [key, value] of incomingForm.entries()) {
      if (value instanceof File) {
        upstreamForm.append(key, value, value.name);
      } else {
        upstreamForm.append(key, String(value));
      }
    }

    const resp = await proxyZhengrong(context, '/generate_3d', {
      method: 'POST',
      body: upstreamForm,
    });

    return relayJson(resp);
  } catch (error) {
    return handleApiError(error);
  }
}
