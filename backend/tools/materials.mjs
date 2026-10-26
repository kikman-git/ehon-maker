import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = `${root}shared/materials`;
const manifest = JSON.parse(await readFile(`${source}/generation.json`, 'utf8'));
const output = `${root}shared/build/materials`;
const web = `${root}web/public/materials`;
const assets = [];
for (const entry of manifest.assets) {
  if (!/^[a-z0-9-]+$/.test(entry.id)) throw Error(`Invalid material ID: ${entry.id}`);
  const file = `${source}/masters/${entry.id}.png`;
  const metadata = await sharp(file).metadata();
  if (!metadata.hasAlpha || !metadata.width || !metadata.height) throw Error(`Transparent PNG required: ${entry.id}`);
  const stats = await sharp(file).stats();
  if (stats.channels[3].min !== 0 || stats.channels[3].max < 200) throw Error(`Invalid transparency: ${entry.id}`);
  const master = await sharp(file).resize(1400, 1400, { fit: 'contain', background: '#00000000', withoutEnlargement: true })
    .extend({ top: 68, bottom: 68, left: 68, right: 68, background: '#00000000' }).png().toBuffer();
  const hash = createHash('sha256').update(master).digest('hex');
  const ref = `a/${hash}`;
  const images = [['m.png', master], ...await Promise.all([1024, 256].map(async size =>
    [`${size}.webp`, await sharp(master).resize(size, size).webp({ quality: 92, alphaQuality: 100 }).toBuffer()]))];
  for (const destination of [output, web]) {
    await mkdir(`${destination}/${ref}`, { recursive: true });
    for (const [name, bytes] of images) await writeFile(`${destination}/${ref}/${name}`, bytes);
  }
  assets.push({ id: `pack.storybook:${entry.id}`, slug: entry.id, name: entry.name, nameEn: entry.nameEn,
    category: entry.category, characterId: entry.characterId ?? entry.id, pose: entry.pose ?? 'default',
    tags: entry.tags ?? [], legacyIds: entry.legacyIds ?? [], masterRef: ref, w: 1536, h: 1536,
    bytes: master.length, sha256: hash, styleId: manifest.styleId });
}
const index = { version: 1, styleId: manifest.styleId, categories: manifest.categories, assets };
await writeFile(`${source}/catalog.json`, JSON.stringify(index, null, 2) + '\n');
await writeFile(`${output}/index.json`, JSON.stringify(index));
await writeFile(`${web}/index.json`, JSON.stringify(index));
const quote = value => JSON.stringify(value);
const rows = assets.map(a => `        Material(${quote(a.id)}, ${quote(a.name)}, ${quote(a.nameEn)}, ${quote(a.category)}, ${quote(a.masterRef)}, ${quote(a.characterId)}, ${quote(a.pose)}, listOf(${a.tags.map(quote).join(', ')}), listOf(${a.legacyIds.map(quote).join(', ')}))`);
const kotlin = `package app.ehon.catalog

// Generated from shared/materials/generation.json by backend/tools/materials.mjs.
internal object StorybookMaterials {
    val categories = listOf(${manifest.categories.map(c => quote(c.name)).join(', ')})
    val all = listOf(
${rows.join(',\n')}
    )
}
`;
await writeFile(`${root}shared/src/commonMain/kotlin/app/ehon/catalog/StorybookMaterials.kt`, kotlin);
console.log(`Prepared ${assets.length} painterly materials in ${output} and ${web}`);
