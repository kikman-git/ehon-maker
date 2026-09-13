// Serves dist/ the way Cloudflare Pages does, with the clean routes of public/_redirects and
// gzip, so Lighthouse measures transfer sizes rather than raw bytes.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.argv[2] ?? 4175);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const route = (pathname) => (/^\/app(\/|$)/.test(pathname) ? '/app.html' : /^\/(read|g)(\/|$)/.test(pathname) ? '/read.html' : pathname === '/' || /^\/login(\/|$)/.test(pathname) ? '/index.html' : pathname);

createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const file = join(root, normalize(route(decodeURIComponent(pathname))));
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) { response.writeHead(404); response.end(); return; }
  const type = types[extname(file)] ?? 'application/octet-stream';
  const gzip = !/^(font\/woff2|image\/)/.test(type) && /\bgzip\b/.test(request.headers['accept-encoding'] ?? '');
  response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', ...(gzip ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : {}) });
  const body = createReadStream(file);
  if (gzip) body.pipe(createGzip({ level: 9 })).pipe(response);
  else body.pipe(response);
}).listen(port, '127.0.0.1', () => process.stdout.write(`listening on http://127.0.0.1:${port}\n`));
