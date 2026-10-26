import catalog from '../../shared/materials/catalog.json';

export const materials = catalog.assets;
export const materialCategories = catalog.categories;
const refs = new Set(materials.map(part => part.masterRef));
const base = `${import.meta.env.BASE_URL}materials`;

export function materialUrl(ref: string, size: '256.webp' | '1024.webp' | 'm.png' = '256.webp'): string {
  return `${base}/${ref}/${size}`;
}

export function bundledMaterialUrl(key: string): string | null {
  return refs.has(key.slice(0, key.lastIndexOf('/'))) ? `${base}/${key}` : null;
}

const normalize = (value: string) => value.normalize('NFKC').toLowerCase()
  .replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));

export function searchMaterials(category: string, query: string) {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return materials.filter(part => (category === 'all' || part.category === category) &&
    words.every(word => normalize([part.name, part.nameEn, part.characterId, part.pose, ...part.tags].join(' ')).includes(word)));
}
