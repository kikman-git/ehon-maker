// Slices each body face into unicode-range woff2 files (decision 49), so a page downloads the
// kana slice plus the kanji blocks its text uses instead of a 4 MB TTF. Sources: the bundled
// Yomogi, the complete faces staged by `cd backend && pnpm fonts` (build/r2-fonts), and the
// bundled Zen Maru Gothic subset as the UI fallback. Output is ignored by Git.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as hb from 'harfbuzzjs';
import subsetFont from 'subset-font';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = `${root}web/public/fonts/`;
const licenses = `${root}web/public/licenses/`;
const generated = `${root}web/src/fonts.generated.ts`;
const stampFile = `${out}.stamp`;
const fetchMissing = process.argv.includes('--fetch');

// The same pinned upstream release as backend/tools/fonts.ts; the phone downloads these files.
const COMMIT = '8e44913e4ff26fc997e6856c1ec40ff4791c98c5';
const faces = [
  { id: 'yomogi', file: 'Yomogi-Regular.ttf', family: 'yomogi', bundled: true, eager: true },
  { id: 'ui', file: 'ZenMaruGothic-Medium.ttf', family: 'zenmarugothic', bundled: true, eager: true },
  { id: 'maru', file: 'ZenMaruGothic-Medium.ttf', family: 'zenmarugothic', bundled: true },
  { id: 'kiwi', file: 'KiwiMaru-Regular.ttf', family: 'kiwimaru' },
  { id: 'pop', file: 'HachiMaruPop-Regular.ttf', family: 'hachimarupop' },
  { id: 'marker', file: 'YuseiMagic-Regular.ttf', family: 'yuseimagic' },
  { id: 'futo', file: 'RocknRollOne-Regular.ttf', family: 'rocknrollone' },
];

// Kana, ASCII, punctuation and full-width forms ship in one always-loaded slice; kanji in
// 128-codepoint blocks; everything else the face carries (Latin-1, Greek, symbols) in one.
const KANA = [[0x20, 0x7e], [0x2000, 0x206f], [0x3000, 0x30ff], [0x31f0, 0x31ff], [0xff00, 0xffef]];
const bucketOf = (cp) => {
  if (KANA.some(([lo, hi]) => cp >= lo && cp <= hi)) return 'kana';
  if (cp >= 0x4e00 && cp <= 0x9fff) return `k${(cp >> 7).toString(16)}`;
  if ((cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0xf900 && cp <= 0xfaff) || cp >= 0x20000) return 'rare';
  return 'latin';
};

// Kana and kanji slices declare whole blocks: a character the face lacks costs one wasted fetch,
// while exact per-face ranges cost 100 KB of manifest on every page.
const blockRange = (bucket, codepoints) => {
  if (bucket === 'kana') return KANA.map(([lo, hi]) => `U+${lo.toString(16)}-${hi.toString(16)}`).join(',');
  if (bucket.startsWith('k')) { const lo = parseInt(bucket.slice(1), 16) << 7; return `U+${lo.toString(16)}-${(lo + 127).toString(16)}`; }
  return rangeText(codepoints);
};

const rangeText = (codepoints) => {
  const ranges = [];
  for (const cp of codepoints) {
    const last = ranges.at(-1);
    if (last && last[1] === cp - 1) last[1] = cp;
    else ranges.push([cp, cp]);
  }
  return ranges.map(([lo, hi]) => (lo === hi ? `U+${lo.toString(16)}` : `U+${lo.toString(16)}-${hi.toString(16)}`)).join(',');
};

async function source(face) {
  const staged = [`${root}tools/fonts-src/${face.file}`, `${root}build/r2-fonts/${face.file}`];
  for (const path of staged) if (existsSync(path)) return path;
  if (fetchMissing) {
    await mkdir(`${root}build/r2-fonts`, { recursive: true });
    for (const [name, target] of [[face.file, face.file], ['OFL.txt', `OFL-${face.family}.txt`]]) {
      const response = await fetch(`https://raw.githubusercontent.com/google/fonts/${COMMIT}/ofl/${face.family}/${name}`);
      if (!response.ok) throw new Error(`Font fetch failed: ${face.family}/${name} (${response.status})`);
      await writeFile(`${root}build/r2-fonts/${target}`, Buffer.from(await response.arrayBuffer()));
    }
    return staged[1];
  }
  const bundled = `${root}iosApp/Ehon/Fonts/${face.file}`;
  return face.bundled && existsSync(bundled) ? bundled : null;
}

const sources = new Map();
for (const face of faces) {
  const path = await source(face);
  if (path) sources.set(face.id, { path, bytes: await readFile(path) });
}
const stamp = createHash('sha256')
  .update(await readFile(fileURLToPath(import.meta.url)))
  .update(JSON.stringify([...sources].map(([id, { path, bytes }]) => [id, path, createHash('sha256').update(bytes).digest('hex')])))
  .digest('hex');
if (existsSync(stampFile) && existsSync(generated) && (await readFile(stampFile, 'utf8')) === stamp) process.exit(0);

await mkdir(out, { recursive: true });
await mkdir(licenses, { recursive: true });
for (const entry of await readdir(out)) await rm(`${out}${entry}`, { force: true });

const manifest = [];
const sharedRanges = {};
const sliced = new Map();
for (const face of faces) {
  const found = sources.get(face.id);
  if (!found) { process.stdout.write(`  ${face.id.padEnd(7)} skipped: ${face.file} not staged (pnpm fonts --fetch, or cd backend && pnpm fonts)\n`); continue; }
  // The UI face and まるまる share one source; slice it once and register both families.
  let slices = sliced.get(found.path);
  if (!slices) {
    const buckets = new Map();
    for (const cp of new hb.Face(new hb.Blob(found.bytes)).collectUnicodes()) {
      if (cp < 0x20) continue;
      const bucket = bucketOf(cp);
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), cp]);
    }
    slices = [];
    let total = 0;
    for (const [bucket, codepoints] of buckets) {
      const woff2 = await subsetFont(found.bytes, String.fromCodePoint(...codepoints), { targetFormat: 'woff2', noHinting: true });
      slices.push({ bucket, woff2, range: blockRange(bucket, codepoints), shared: bucket === 'kana' || bucket.startsWith('k') });
      total += woff2.length;
    }
    sliced.set(found.path, slices);
    process.stdout.write(`  ${face.id.padEnd(7)} ${face.file.padEnd(28)} ${(found.bytes.length / 1e6).toFixed(1)} MB → ${slices.length} slices, ${(total / 1e6).toFixed(2)} MB\n`);
  }
  const files = {};
  const ranges = {};
  for (const { bucket, woff2, range, shared } of slices) {
    const hash = createHash('sha256').update(woff2).digest('hex').slice(0, 8);
    await writeFile(`${out}${face.id}-${bucket}.${hash}.woff2`, woff2);
    files[bucket] = hash;
    if (shared) sharedRanges[bucket] = range;
    else ranges[bucket] = range;
  }
  manifest.push({ id: face.id, eager: face.eager ? ['kana'] : [], files, ranges });
  const license = found.path.replace(face.file, `OFL-${face.family}.txt`);
  if (existsSync(license)) await copyFile(license, `${licenses}OFL-${face.family}.txt`);
}

await writeFile(generated, `// Generated by tools/slice-fonts.mjs from the staged font sources. Do not edit.
// A slice is \`<id>-<bucket>.<hash>.woff2\`; kana and kanji buckets share block ranges, the rest list theirs.
export interface FontFaceFiles { id: string; eager: string[]; files: Record<string, string>; ranges: Record<string, string> }
export const fontRanges: Record<string, string> = ${JSON.stringify(sharedRanges)};
export const fontFaces: FontFaceFiles[] = ${JSON.stringify(manifest)};
`);
await writeFile(stampFile, stamp);
