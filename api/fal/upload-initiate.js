import {
  allowMethods,
  createUploadSession,
  getJsonBody,
  handleApiError,
  requireNonEmptyString,
  sendJson,
} from '../_lib/fal.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;

  try {
    const body = await getJsonBody(req);
    const fileName = requireNonEmptyString(body.fileName, 'fileName');
    const contentType = requireNonEmptyString(body.contentType, 'contentType');
    const upload = await createUploadSession({ fileName, contentType });

    sendJson(res, 200, {
      uploadUrl: upload.upload_url,
      fileUrl: upload.file_url,
    });
  } catch (error) {
    handleApiError(res, error);
  }
}
