import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const source = fileURLToPath(new URL('../../shared/materials/', import.meta.url));
const manifest = JSON.parse(await readFile(`${source}generation.json`, 'utf8'));
const catalog = JSON.parse(await readFile(`${source}catalog.json`, 'utf8'));
const targets = { animals: 300, nature: 35, people: 40, objects: 30, vehicles: 20, food: 25, places: 15, backgrounds: 15, scenes: 10, seasonal: 10 };
const errors = [];
const ids = new Set();
const aliases = new Set();
const hashes = new Set();
const families = new Map();
const categories = new Map(manifest.categories.map(category => [category.name, category]));
for (const item of manifest.assets) {
  if (!/^[a-z0-9-]+$/.test(item.id) || ids.has(item.id)) errors.push(`Invalid/duplicate ID: ${item.id}`);
  ids.add(item.id);
  if (!categories.has(item.category)) errors.push(`Unknown category: ${item.id}`);
  if (!item.name || !item.nameEn || !item.prompt || !item.characterId || !item.pose) errors.push(`Missing metadata: ${item.id}`);
  if (item.referenceAsset && !manifest.assets.some(asset => asset.id === item.referenceAsset)) errors.push(`Unknown reference: ${item.id}`);
  for (const alias of item.legacyIds ?? []) {
    if (aliases.has(alias)) errors.push(`Duplicate alias: ${alias}`);
    aliases.add(alias);
  }
  const family = families.get(item.characterId) ?? [];
  if (family.includes(item.pose)) errors.push(`Duplicate character/pose: ${item.characterId}/${item.pose}`);
  family.push(item.pose);
  families.set(item.characterId, family);
  try {
    const png = await readFile(`${source}masters/${item.id}.png`);
    const hash = createHash('sha256').update(png).digest('hex');
    if (hashes.has(hash)) errors.push(`Duplicate artwork bytes: ${item.id}`);
    hashes.add(hash);
    const metadata = await sharp(png).metadata();
    const stats = await sharp(png).stats();
    if (!metadata.hasAlpha || metadata.format !== 'png' || metadata.width < 1024 || metadata.height < 1024 || stats.channels[3]?.min !== 0 || stats.channels[3]?.max < 200) errors.push(`Invalid PNG/alpha/resolution: ${item.id}`);
    const entry = catalog.assets.find(asset => asset.id === `pack.storybook:${item.id}`);
    const normalized = await sharp(png).resize(1400, 1400, { fit: 'contain', background: '#00000000', withoutEnlargement: true })
      .extend({ top: 68, bottom: 68, left: 68, right: 68, background: '#00000000' }).png().toBuffer();
    if (!entry || entry.sha256 !== createHash('sha256').update(normalized).digest('hex')) errors.push(`Stale generated catalog: ${item.id}; run pnpm materials`);
  } catch (error) { errors.push(`Unreadable master ${item.id}: ${error.message}`); }
}
for (const file of await readdir(`${source}masters`)) if (file.endsWith('.png') && !ids.has(file.slice(0, -4))) errors.push(`Uncataloged master: ${file}`);
if (catalog.assets.length !== manifest.assets.length) errors.push('Catalog/source count mismatch');
console.log(`Accepted source entries: ${ids.size}/500 (${500 - ids.size} remaining)`);
for (const category of manifest.categories) {
  const count = manifest.assets.filter(asset => asset.category === category.name).length;
  console.log(`${category.nameEn}: ${count}/${targets[category.id]}`);
}
console.log('\nAnimal pose coverage (10 per character):');
const animals = ['bird', 'butterfly', 'fish', 'turtle', 'octopus', 'whale', 'penguin', 'crab', 'ladybug', 'owl', 'cat', 'dog', 'rabbit', 'bear', 'fox', 'squirrel', 'mouse', 'hedgehog', 'deer', 'raccoon', 'panda', 'elephant', 'giraffe', 'lion', 'monkey', 'horse', 'cow', 'sheep', 'pig', 'duck'];
for (const animal of animals) { const poses = families.get(animal) ?? []; console.log(`${animal}: ${poses.length}/10 — ${poses.join(', ') || 'not started'}`); }
if (errors.length) { console.error(`\n${errors.length} validation errors:\n${errors.join('\n')}`); process.exitCode = 1; }
else console.log('\nAll source files, IDs, poses, references and generated master hashes are valid. Visual approval still requires human/agent review.');
