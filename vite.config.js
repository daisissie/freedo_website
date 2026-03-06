import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

function edgeApiPlugin({ name, mountPath, handlersRoot, routes, env }) {
  const handlerCache = new Map();

  return {
    name,
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(mountPath, async (req, res, next) => {
        const requestUrl = new URL(req.url || '/', 'http://localhost');
        const route = routes.find(r => r.re.test(requestUrl.pathname));
        if (!route) return next();

        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const bodyBuf = Buffer.concat(chunks);

          const webRequest = new Request(requestUrl, {
            method: req.method,
            headers: Object.fromEntries(
              Object.entries(req.headers).filter(([, value]) => value != null)
            ),
            ...(bodyBuf.length > 0 && req.method !== 'GET' && req.method !== 'HEAD'
              ? { body: bodyBuf }
              : {}),
          });

          const match = requestUrl.pathname.match(route.re);
          const context = {
            request: webRequest,
            params: route.params(match),
            env,
          };

          if (!handlerCache.has(route.file)) {
            const url = pathToFileURL(join(handlersRoot, route.file)).href;
            handlerCache.set(route.file, (await import(url)).default);
          }
          const handler = handlerCache.get(route.file);

          const webRes = await handler(context);
          res.statusCode = webRes.status;
          for (const [key, value] of webRes.headers.entries()) res.setHeader(key, value);
          res.end(Buffer.from(await webRes.arrayBuffer()));
        } catch (error) {
          console.error(`[${name}]`, error.message);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const runtimeEnv = {
    FAL_KEY: env.FAL_KEY || '',
    ZHENGRONG_BASE: env.ZHENGRONG_BASE || '',
  };

  return {
    build: {
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        input: {
          home: resolve(__dirname, 'index.html'),
          about: resolve(__dirname, 'about.html'),
          demo: resolve(__dirname, 'demo.html'),
        },
      },
    },
    plugins: [
      edgeApiPlugin({
        name: 'fal-api-dev',
        mountPath: '/api/fal',
        handlersRoot: join(process.cwd(), 'node-functions/api/fal'),
        routes: [
          { re: /^\/submit$/, file: 'submit.js', params: () => ({}) },
          {
            re: /^\/status\/(.+)$/,
            file: 'status/[requestId].js',
            params: match => ({ requestId: decodeURIComponent(match[1]) }),
          },
          {
            re: /^\/result\/(.+)$/,
            file: 'result/[requestId].js',
            params: match => ({ requestId: decodeURIComponent(match[1]) }),
          },
          {
            re: /^\/download\/(.+)$/,
            file: 'download/[requestId].js',
            params: match => ({ requestId: decodeURIComponent(match[1]) }),
          },
        ],
        env: runtimeEnv,
      }),
      edgeApiPlugin({
        name: 'zhengrong-api-dev',
        mountPath: '/api/zhengrong',
        handlersRoot: join(process.cwd(), 'node-functions/api/zhengrong'),
        routes: [
          { re: /^\/generate_3d$/, file: 'generate_3d.js', params: () => ({}) },
          { re: /^\/job_status$/, file: 'job_status.js', params: () => ({}) },
          { re: /^\/extract_glb$/, file: 'extract_glb.js', params: () => ({}) },
          { re: /^\/glb_status$/, file: 'glb_status.js', params: () => ({}) },
          { re: /^\/download_glb$/, file: 'download_glb.js', params: () => ({}) },
        ],
        env: runtimeEnv,
      }),
    ],
  };
});
