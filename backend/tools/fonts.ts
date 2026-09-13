import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { R2Store } from '../functions/src/r2.ts';

// Pinned upstream release: changing it is a deliberate font update, not a deploy side effect.
const commit = '8e44913e4ff26fc997e6856c1ec40ff4791c98c5';
const fonts = [
  ['zenmarugothic', 'ZenMaruGothic-Medium.ttf'], ['kiwimaru', 'KiwiMaru-Regular.ttf'],
  ['hachimarupop', 'HachiMaruPop-Regular.ttf'], ['yuseimagic', 'YuseiMagic-Regular.ttf'], ['rocknrollone', 'RocknRollOne-Regular.ttf'],
];
const directory = resolve('../build/r2-fonts');
await mkdir(directory, { recursive: true });
for (const [family, name] of fonts) {
  for (const [source, output] of [[name, name], ['OFL.txt', `OFL-${family}.txt`]]) {
    const response = await fetch(`https://raw.githubusercontent.com/google/fonts/${commit}/ofl/${family}/${source}`);
    if (!response.ok) throw Error(`Font fetch failed: ${family}/${source} (${response.status})`);
    await writeFile(resolve(directory, output), Buffer.from(await response.arrayBuffer()));
  }
}
if (process.argv.includes('--upload')) {
  const required = ['R2_BUCKET', 'R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'] as const;
  for (const key of required) if (!process.env[key]) throw Error(`${key} is required for upload`);
  const store = new R2Store(process.env.R2_BUCKET!, process.env.R2_ENDPOINT!, process.env.R2_ACCESS_KEY_ID!, process.env.R2_SECRET_ACCESS_KEY!);
  for (const file of await readdir(directory)) {
    await store.write(`fonts/${file}`, await readFile(resolve(directory, file)), file.endsWith('.ttf') ? 'font/ttf' : 'text/plain; charset=utf-8', 'public, max-age=86400');
  }
  process.stdout.write(`Uploaded five fonts and their licenses to ${process.env.R2_BUCKET}.\n`);
} else { process.stdout.write(`Prepared five fonts and their licenses in ${directory}. Pass --upload after configuring R2.\n`); }
