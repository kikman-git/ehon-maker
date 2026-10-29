import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { R2Store } from '../functions/src/r2.ts';

const source = fileURLToPath(new URL('../../shared/build/materials/', import.meta.url));
const pointerBytes = await readFile(`${source}index.json`);
const pointer = JSON.parse(pointerBytes.toString());
if (pointer.version !== 1 || !/^[0-9a-f]{64}$/.test(pointer.revision) || pointer.file !== `catalogs/${pointer.revision}.json`) throw Error('Invalid material pointer');
const catalogBytes = await readFile(`${source}${pointer.file}`);
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
if (hash(catalogBytes) !== pointer.revision || catalogBytes.length !== pointer.bytes) throw Error('Catalog checksum mismatch');
const catalog = JSON.parse(catalogBytes.toString());
const objects: { key: string; file: string; mime: string }[] = [];
for (const asset of catalog.assets) {
  if (!/^a\/[0-9a-f]{64}$/.test(asset.masterRef)) throw Error('Invalid material reference');
  if (hash(await readFile(`${source}${asset.masterRef}/m.png`)) !== asset.masterRef.slice(2)) throw Error(`Master checksum mismatch: ${asset.id}`);
  for (const name of ['m.png', '1024.webp', '256.webp']) {
    const file = `${source}${asset.masterRef}/${name}`;
    await readFile(file);
    objects.push({ key: `${asset.masterRef}/${name}`, file, mime: name.endsWith('.png') ? 'image/png' : 'image/webp' });
  }
}
objects.push({ key: `materials/${pointer.file}`, file: `${source}${pointer.file}`, mime: 'application/json' });
objects.push({ key: 'materials/index.json', file: `${source}index.json`, mime: 'application/json' });
if (process.argv.includes('--upload')) {
  for (const key of ['R2_BUCKET', 'R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) if (!process.env[key]) throw Error(`${key} is required`);
  const store = new R2Store(process.env.R2_BUCKET!, process.env.R2_ENDPOINT!, process.env.R2_ACCESS_KEY_ID!, process.env.R2_SECRET_ACCESS_KEY!);
  // Publish the pointer last so readers never discover a partially uploaded batch.
  for (const object of objects) await store.write(object.key, await readFile(object.file), object.mime,
    object.key === 'materials/index.json' ? 'public, max-age=300' : 'public, max-age=31536000, immutable');
  console.log(`Published ${catalog.assets.length} materials; revision ${pointer.revision}`);
} else console.log(`Validated ${objects.length} objects for ${catalog.assets.length} materials. Pass --upload to publish; no remote writes made.`);
