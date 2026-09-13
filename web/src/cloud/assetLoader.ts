import { cloud } from './config';

const REF = /^a\/[0-9a-f]{64}$/;
export const MAX_MASTER_BYTES = 25 * 1024 * 1024;
export const MAX_MASTER_PIXELS = 2048;

/**
 * Decoded bitmaps under one pixel budget. Eviction drops the element's source so the decoder
 * memory returns; a miss paints the painter's placeholder and repaints when the load lands.
 */
export class AssetLoader {
  onChange: () => void = () => {};
  private readonly cache = new Map<string, { image: HTMLImageElement; bytes: number }>();
  private readonly loading = new Set<string>();
  private readonly retryAfter = new Map<string, number>();
  private total = 0;

  constructor(private readonly baseUrl: () => string | null, private readonly budget = 256 * 1024 * 1024) {}

  static validRef(ref: string): boolean { return REF.test(ref); }

  /** The 1024px derivative for screens; the master for exports. Never blocks. */
  image(ref: string, master = false): HTMLImageElement | null {
    if (!REF.test(ref)) return null;
    const key = `${ref}/${master ? 'm.png' : '1024.webp'}`;
    const hit = this.touch(key);
    if (hit) return hit;
    this.request(key);
    return this.touch(`${ref}/256.webp`) ?? (master ? this.touch(`${ref}/1024.webp`) : null);
  }

  /** Warms the cache for every raster part on a page before it is shown. */
  prefetch(refs: string[]): void {
    for (const ref of refs) if (REF.test(ref)) this.request(`${ref}/1024.webp`);
  }

  clear(): void {
    for (const entry of this.cache.values()) entry.image.src = '';
    this.cache.clear();
    this.total = 0;
  }

  private touch(key: string): HTMLImageElement | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.image;
  }

  private request(key: string): void {
    const base = this.baseUrl();
    if (!base || this.loading.has(key) || this.cache.has(key) || (this.retryAfter.get(key) ?? 0) > Date.now()) return;
    this.loading.add(key);
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.src = `${base}/${key}`;
    image.decode().then(() => {
      if (image.naturalWidth === 0 || image.naturalWidth > MAX_MASTER_PIXELS || image.naturalHeight > MAX_MASTER_PIXELS) throw new Error('bad image');
      this.remember(key, image);
      this.onChange();
    }).catch(() => {
      image.src = '';
      this.retryAfter.set(key, Date.now() + 30_000);
    }).finally(() => this.loading.delete(key));
  }

  private remember(key: string, image: HTMLImageElement): void {
    const bytes = image.naturalWidth * image.naturalHeight * 4;
    while (this.total + bytes > this.budget && this.cache.size > 0) {
      const [oldest, entry] = this.cache.entries().next().value!;
      this.cache.delete(oldest);
      this.total -= entry.bytes;
      entry.image.src = '';
    }
    this.cache.set(key, { image, bytes });
    this.total += bytes;
  }
}

export const assets = new AssetLoader(() => cloud?.assetsUrl ?? null);
