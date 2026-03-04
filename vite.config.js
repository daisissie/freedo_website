import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

/**
 * Dev-only Vite plugin: serves node-functions/api/fal/* handlers locally
 * so `npm run dev` can exercise the full API without a separate server.
 */
function falApiPlugin(env) {
  const HANDLERS_ROOT = join(process.cwd(), 'node-functions/api/fal');

  const routes = [
    { re: /^\/upload-initiate$/, file: 'upload-initiate.js', params: () => ({}) },
    { re: /^\/submit$/,          file: 'submit.js',          params: () => ({}) },
    { re: /^\/status\/(.+)$/,   file: 'status/[requestId].js', params: m => ({ requestId: decodeURIComponent(m[1]) }) },
    { re: /^\/result\/(.+)$/,   file: 'result/[requestId].js', params: m => ({ requestId: decodeURIComponent(m[1]) }) },
  ];

  // Cache imported handler modules for the lifetime of the dev server
  const handlerCache = new Map();

  return {
    name: 'fal-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/fal', async (req, res, next) => {
        const pathname = req.url || '/';
        const route = routes.find(r => r.re.test(pathname));
        if (!route) return next();

        try {
          // Collect body
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const bodyBuf = Buffer.concat(chunks);

          // Build Web API Request
          const webRequest = new Request(new URL(pathname, 'http://localhost'), {
            method: req.method,
            headers: Object.fromEntries(
              Object.entries(req.headers).filter(([, v]) => v != null)
            ),
            ...(bodyBuf.length > 0 && req.method !== 'GET' && req.method !== 'HEAD'
              ? { body: bodyBuf }
              : {}),
          });

          // Build EdgeOne-style context
          const match = pathname.match(route.re);
          const context = {
            request: webRequest,
            params: route.params(match),
            env: { FAL_KEY: env.FAL_KEY || '' },
          };

          // Import handler (cached after first load)
          if (!handlerCache.has(route.file)) {
            const url = pathToFileURL(join(HANDLERS_ROOT, route.file)).href;
            handlerCache.set(route.file, (await import(url)).default);
          }
          const handler = handlerCache.get(route.file);

          // Run handler and pipe Web Response → Node response
          const webRes = await handler(context);
          res.statusCode = webRes.status;
          for (const [k, v] of webRes.headers.entries()) res.setHeader(k, v);
          res.end(Buffer.from(await webRes.arrayBuffer()));
        } catch (err) {
          console.error('[fal-api]', err.message);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ''); // load all vars (not just VITE_ prefix)

  return {
    build: {
      rollupOptions: {
        input: {
          home: resolve(__dirname, 'index.html'),
          about: resolve(__dirname, 'about.html'),
          demo: resolve(__dirname, 'demo.html'),
        },
      },
    },
    plugins: [falApiPlugin(env)],
  };
});
