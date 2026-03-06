export function runNodeFunction(handler, request, params = {}) {
  return handler({
    request,
    params,
    env: process.env,
  });
}
