import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Mirrors public/_redirects for the dev and preview servers: clean paths land on their entry page. */
function cleanRoutes(): Plugin {
  const rewrite = (url: string) => {
    if (/^\/app(\/|\?|$)/.test(url)) return '/app.html';
    if (/^\/(read|g)(\/|\?|$)/.test(url)) return '/read.html';
    if (/^\/login(\/|\?|$)/.test(url)) return '/index.html';
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

type LocalTemplate = { id: string; url: string; path: string } & Record<string, unknown>;

/**
 * Stands in for the assets Worker's `templates/` prefix on the dev and preview servers with the
 * stories Gradle assembled into shared/build/templates (decision #61).
 */
function localTemplates(): Plugin {
  const built = fileURLToPath(new URL('../shared/build/templates/', import.meta.url));
  const entries = (): LocalTemplate[] => {
    if (!existsSync(`${built}index.json`)) return [];
    const index = JSON.parse(readFileSync(`${built}index.json`, 'utf8')) as { templates: (LocalTemplate & { file: string })[] };
    return index.templates.map((entry) => ({ ...entry, path: `${built}${entry.file}` }));
  };
  const middleware = (req: { url?: string }, res: { setHeader(name: string, value: string): void; statusCode: number; end(body?: string | Buffer): void }, next: () => void) => {
    const url = (req.url ?? '').split('?')[0];
    if (url === '/templates/index.json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ version: 1, templates: entries().map(({ path: _path, ...entry }) => entry) }));
      return;
    }
    const match = /^\/templates\/([a-z0-9-]+)\/([0-9a-f]{12})\.ehon\.json$/.exec(url);
    if (match) {
      const entry = entries().find((item) => item.id === match[1] && item.url.endsWith(`/${match[2]}.ehon.json`));
      if (!entry) { res.statusCode = 404; res.end(); return; }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(readFileSync(entry.path));
      return;
    }
    next();
  };
  return {
    name: 'ehon-local-templates',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}

export default defineConfig({
  plugins: [react(), cleanRoutes(), localTemplates()],
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
