import { cloud } from './config';
import { materialAssetUrl } from '../materials';
import { decodeAsset } from './assetBytes';

const REF = /^a\/[0-9a-f]{64}$/;
export const MAX_MASTER_BYTES = 25 * 1024 * 1024;
export const MAX_MASTER_PIXELS = 2048;

export class AssetLoader {
  onChange: () => void = () => {};
  private readonly cache = new Map<string, { image: HTMLImageElement; bytes: number }>();
  private readonly loading = new Set<string>();
  private readonly retryAfter = new Map<string, number>();
  private total = 0;

  constructor(private readonly baseUrl: () => string | null, private readonly budget = 256 * 1024 * 1024) {}

  static validRef(ref: string): boolean { return REF.test(ref); }

  image(ref: string, master = false): HTMLImageElement | null {
    if (!REF.test(ref)) return null;
    const key = `${ref}/${master ? 'm.png' : '1024.webp'}`;
    const hit = this.touch(key);
    if (hit) return hit;
    this.request(key);
    return this.touch(`${ref}/256.webp`) ?? (master ? this.touch(`${ref}/1024.webp`) : null);
  }

  prefetch(refs: string[]): void {
    for (const ref of refs) if (REF.test(ref)) this.request(`${ref}/1024.webp`);
  }

  async loadMaster(ref: string): Promise<HTMLImageElement> {
    if (!REF.test(ref)) throw new Error('Invalid asset reference');
    const key = `${ref}/m.png`;
    const base = this.baseUrl();
    const url = materialAssetUrl(key) ?? (base ? `${base}/${key}` : null);
    if (!url) throw new Error('Asset unavailable');
    return decodeAsset(url, key);
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
    const url = materialAssetUrl(key) ?? (base ? `${base}/${key}` : null);
    if (!url || this.loading.has(key) || this.cache.has(key) || (this.retryAfter.get(key) ?? 0) > Date.now()) return;
    this.loading.add(key);
    decodeAsset(url, key).then(image => {
      this.remember(key, image);
      this.onChange();
    }).catch(() => {
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
