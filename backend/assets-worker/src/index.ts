interface Env { ASSETS: R2Bucket }

export function publicKey(path: string): string | null {
  const key = path.replace(/^\//, '');
  return /^(?:a\/[0-9a-f]{64}\/(?:m\.png|m\.webp|1024\.webp|256\.webp)|fonts\/[A-Za-z0-9_-]+\.(?:ttf|txt))$/.test(key) ? key : null;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
    const key = publicKey(new URL(request.url).pathname);
    if (!key) return new Response(null, { status: 404 });
    const cacheURL = new URL(request.url); cacheURL.search = '';
    const cacheKey = new Request(cacheURL, { method: 'GET' });
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      if (request.headers.get('If-None-Match') === cached.headers.get('ETag')) return new Response(null, { status: 304, headers: cached.headers });
      return request.method === 'HEAD' ? new Response(null, { headers: cached.headers }) : cached;
    }
    const object = await env.ASSETS.get(key);
    if (!object) return new Response(null, { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('ETag', object.httpEtag);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', key.startsWith('a/') ? 'public, max-age=31536000, immutable' : 'public, max-age=86400');
    if (request.headers.get('If-None-Match') === object.httpEtag) return new Response(null, { status: 304, headers });
    const response = new Response(request.method === 'HEAD' ? null : object.body, { headers });
    if (request.method === 'GET') ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
    return response;
  },
};
