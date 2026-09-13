import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/** Mirrors public/_redirects for the dev and preview servers: clean paths land on their entry page. */
function cleanRoutes(): Plugin {
  const rewrite = (url: string) => {
    if (/^\/app(\/|\?|$)/.test(url)) return '/app.html';
    if (/^\/(read|g)(\/|\?|$)/.test(url)) return '/read.html';
    return null;
  };
  const middleware = (req: { url?: string }, _res: unknown, next: () => void) => {
    const target = req.url ? rewrite(req.url) : null;
    if (target) req.url = target;
    next();
  };
  return {
    name: 'ehon-clean-routes',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

export default defineConfig({
  plugins: [react(), cleanRoutes()],
  build: {
    target: 'safari17',
    rolldownOptions: {
      input: {
        index: fileURLToPath(new URL('index.html', import.meta.url)),
        app: fileURLToPath(new URL('app.html', import.meta.url)),
        read: fileURLToPath(new URL('read.html', import.meta.url)),
      },
    },
  },
});
