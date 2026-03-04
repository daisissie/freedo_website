import {
  allowMethods,
  createUploadSession,
  getJsonBody,
  handleApiError,
  requireNonEmptyString,
  sendJson,
} from '../../_lib/fal.js';

export default async function onRequest(context) {
  const methodNotAllowed = allowMethods(context.request, ['POST']);
  if (methodNotAllowed) return methodNotAllowed;

  try {
    const body = await getJsonBody(context.request);
    const fileName = requireNonEmptyString(body.fileName, 'fileName');
    const contentType = requireNonEmptyString(body.contentType, 'contentType');
    const upload = await createUploadSession(context, { fileName, contentType });

    return sendJson(
      {
        uploadUrl: upload.upload_url,
        fileUrl: upload.file_url,
      },
      200
    );
  } catch (error) {
    return handleApiError(error);
  }
}
