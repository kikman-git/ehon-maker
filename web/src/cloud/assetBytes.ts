import { sha256Hex } from './hash';

const MAX_BYTES = 25 * 1024 * 1024;
const CACHE_BUDGET = 256 * 1024 * 1024;
const requests = new Map<string, Promise<Blob>>();
let cacheWrite: Promise<void> = Promise.resolve();

export function assetBytes(url: string, key: string): Promise<Blob> {
  const cacheKey = new URL(url, location.href).href;
  const running = requests.get(cacheKey);
  if (running) return running;
  const request = (async () => {
    const cache = typeof caches === 'undefined' ? null : await caches.open('ehon-images-v1').catch(() => null);
    const validate = async (response: Response) => {
      if (!response.ok || Number(response.headers.get('Content-Length')) > MAX_BYTES) throw Error('Invalid image response');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) throw Error('Image too large');
      if (key.endsWith('/m.png') && await sha256Hex(bytes) !== key.split('/')[1]) throw Error('Image checksum mismatch');
      const blob = new Blob([bytes], { type: key.endsWith('.png') ? 'image/png' : 'image/webp' });
      // A damaged derivative must not survive every retry in the offline cache.
      const decoded = await imageFromBlob(blob);
      decoded.src = '';
      return blob;
    };
    const cached = await cache?.match(cacheKey).catch(() => undefined);
    if (cached) {
      try { return await validate(cached); }
      catch { await cache?.delete(cacheKey).catch(() => undefined); }
    }
    const blob = await validate(await fetch(cacheKey, { signal: AbortSignal.timeout(30_000) }));
    if (cache) {
      cacheWrite = cacheWrite.then(async () => {
        const keys = await cache.keys();
        let total = blob.size;
        const sizes = await Promise.all(keys.map(async request => Number((await cache.match(request))?.headers.get('Content-Length') ?? 0)));
        total += sizes.reduce((a, b) => a + b, 0);
        for (let i = 0; i < keys.length && total > CACHE_BUDGET; i++) { await cache.delete(keys[i]); total -= sizes[i]; }
        await cache.put(cacheKey, new Response(blob, { headers: { 'Content-Type': blob.type, 'Content-Length': String(blob.size) } }));
      }).catch(() => undefined);
      await cacheWrite;
    }
    return blob;
  })().finally(() => { requests.delete(cacheKey); });
  requests.set(cacheKey, request);
  return request;
}

export async function decodeAsset(url: string, key: string): Promise<HTMLImageElement> {
  return imageFromBlob(await assetBytes(url, key));
}

async function imageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.src = objectUrl;
  try {
    await image.decode();
    if (!image.naturalWidth || image.naturalWidth > 2048 || image.naturalHeight > 2048) throw Error('Invalid image dimensions');
    return image;
  } catch (error) { image.src = ''; throw error; }
  finally { URL.revokeObjectURL(objectUrl); }
}
