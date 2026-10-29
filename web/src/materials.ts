import { EhonCodec } from '@ehon/core';
import catalog from '../../shared/materials/catalog.json';
import bundledIds from '../../shared/materials/bundled-ids.json';
import { cloud } from './cloud/config';
import { sha256Hex } from './cloud/hash';
import { createStore } from './cloud/store';

export type Material = Pick<typeof catalog.assets[number], 'id' | 'name' | 'nameEn' | 'category' | 'masterRef' | 'characterId' | 'pose' | 'tags' | 'legacyIds'>;
export let materials: Material[] = catalog.assets;
export const materialCategories = catalog.categories;
export const materialStore = createStore({ epoch: 0, status: 'bundled' as 'bundled' | 'ready' | 'offline' | 'loading' });
const refs = new Set(catalog.assets.filter(part => bundledIds.includes(part.slug)).map(part => part.masterRef));
const localBase = `${import.meta.env.BASE_URL}materials`;
const remoteBase = (import.meta.env.VITE_MATERIALS_URL || (!import.meta.env.DEV && cloud?.assetsUrl ? `${cloud.assetsUrl}/materials` : localBase)).replace(/\/$/, '');
const assetBase = (import.meta.env.VITE_MATERIAL_ASSETS_URL || (!import.meta.env.DEV && cloud?.assetsUrl) || import.meta.env.BASE_URL).replace(/\/$/, '');
const codec = EhonCodec.getInstance();
let loading: Promise<void> | null = null;
let restored = false;

export function bundledMaterialUrl(key: string): string | null {
  return refs.has(key.slice(0, key.lastIndexOf('/'))) ? `${localBase}/${key}` : null;
}

export function materialAssetUrl(key: string): string | null {
  const ref = key.slice(0, key.lastIndexOf('/'));
  return bundledMaterialUrl(key) ?? (materials.some(part => part.masterRef === ref) ? `${assetBase}/${key}` : null);
}

export function materialUrl(ref: string, size: '256.webp' | '1024.webp' | 'm.png' = '256.webp'): string {
  return materialAssetUrl(`${ref}/${size}`) ?? `${assetBase}/${ref}/${size}`;
}

async function accept(json: string, revision: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(revision) || json.length > 2_000_000 || await sha256Hex(json) !== revision || !codec.installMaterials(json)) return false;
  materials = JSON.parse(codec.materialsJson()).assets;
  materialStore.update({ epoch: materialStore.get().epoch + 1 });
  return true;
}

export function loadMaterials(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    materialStore.update({ status: 'loading' });
    const cacheKey = new URL(`${remoteBase}/offline-catalog`, location.href).href;
    const cache = typeof caches === 'undefined' ? null : await caches.open('ehon-material-catalog-v1').catch(() => null);
    if (!restored) {
      restored = true;
      try {
        const saved = await cache?.match(cacheKey);
        if (saved) {
          const { json, revision } = await saved.json();
          if (typeof json === 'string' && typeof revision === 'string') await accept(json, revision);
        }
      } catch { /* The bundled catalog remains available if the cache is damaged. */ }
    }
    try {
      const response = await fetch(`${remoteBase}/index.json`, { cache: 'no-cache', signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw Error('Catalog unavailable');
      const pointer = await response.json();
      if (pointer.version !== 1 || !/^[0-9a-f]{64}$/.test(pointer.revision) || pointer.file !== `catalogs/${pointer.revision}.json` || !Number.isInteger(pointer.bytes) || pointer.bytes < 1 || pointer.bytes > 2_000_000) throw Error('Invalid catalog pointer');
      const source = await fetch(`${remoteBase}/${pointer.file}`, { signal: AbortSignal.timeout(10_000) });
      if (!source.ok) throw Error('Catalog unavailable');
      const json = await source.text();
      if (new TextEncoder().encode(json).length !== pointer.bytes || !await accept(json, pointer.revision)) throw Error('Invalid catalog');
      await cache?.put(cacheKey, new Response(JSON.stringify({ json, revision: pointer.revision }), { headers: { 'Content-Type': 'application/json' } })).catch(() => undefined);
      materialStore.update({ status: 'ready' });
    } catch { materialStore.update({ status: 'offline' }); }
  })().finally(() => { loading = null; });
  return loading;
}

const normalize = (value: string) => value.normalize('NFKC').toLowerCase()
  .replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));

export function searchMaterials(category: string, query: string) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return materials.filter(part => (category === 'all' || part.category === category) &&
    words.every(word => normalize([part.name, part.nameEn, part.characterId, part.pose, ...part.tags].join(' ')).includes(word)));
}
