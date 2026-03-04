// Keep middleware as a pass-through so `/api/*` stays on EdgeOne node-functions.
export function middleware(context) {
  return context.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
