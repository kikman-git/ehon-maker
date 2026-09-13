import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { R2Store } from '../functions/src/r2.ts';

// Publishes the assembled story templates (decision #60). `make web-core` or
// `./gradlew :shared:assembleTemplates` writes shared/build/templates/{index.json,*.ehon.json};
// this stages them as R2 objects and uploads documents first, the index last, so a client never
// reads an index entry it cannot fetch. Documents are content-addressed and immutable; the index
// is cached for five minutes by the assets Worker.
const source = resolve('../shared/build/templates');
const staging = resolve('../build/r2-templates');
const mime = 'application/json; charset=utf-8';
const index = JSON.parse(await readFile(resolve(source, 'index.json'), 'utf8')) as { version: number; templates: Record<string, unknown>[] };
const objects: { key: string; bytes: Buffer; cache: string }[] = [];
for (const entry of index.templates) {
  const bytes = await readFile(resolve(source, entry.file as string));
  delete entry.file; // a local name only; the published index carries the content-addressed url
  objects.push({ key: `templates/${entry.url as string}`, bytes, cache: 'public, max-age=31536000, immutable' });
}
objects.push({ key: 'templates/index.json', bytes: Buffer.from(JSON.stringify(index)), cache: 'public, max-age=300' });
await rm(staging, { recursive: true, force: true });
for (const { key, bytes } of objects) {
  await mkdir(dirname(resolve(staging, key)), { recursive: true });
  await writeFile(resolve(staging, key), bytes);
}
const flag = (name: string) => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
if (process.argv.includes('--upload')) {
  const required = ['R2_BUCKET', 'R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'] as const;
  for (const key of required) if (!process.env[key]) throw Error(`${key} is required for upload`);
  const store = new R2Store(process.env.R2_BUCKET!, process.env.R2_ENDPOINT!, process.env.R2_ACCESS_KEY_ID!, process.env.R2_SECRET_ACCESS_KEY!);
  for (const { key, bytes, cache } of objects) await store.write(key, bytes, mime, cache);
  process.stdout.write(`Uploaded ${objects.length - 1} templates and the index to ${process.env.R2_BUCKET}.\n`);
} else if (process.argv.includes('--wrangler')) {
  // The signed-in Wrangler session uploads without S3 credentials on this machine.
  const bucket = flag('--bucket') ?? 'ehon-assets-dev';
  for (const { key, cache } of objects) {
    const result = spawnSync('pnpm', ['exec', 'wrangler', 'r2', 'object', 'put', `${bucket}/${key}`, '--file', resolve(staging, key), '--content-type', mime, '--cache-control', cache, '--remote', '--force'], { stdio: 'inherit' });
    if (result.status !== 0) throw Error(`wrangler could not upload ${key}`);
  }
  process.stdout.write(`Uploaded ${objects.length - 1} templates and the index to ${bucket}.\n`);
} else {
  process.stdout.write(`Staged ${objects.length - 1} templates and the index in ${staging}. Pass --upload (R2 credentials) or --wrangler [--bucket NAME] to publish.\n`);
}
