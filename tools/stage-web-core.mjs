import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../shared/build/dist/js/productionLibrary/', import.meta.url));
const destination = fileURLToPath(new URL('../web/vendor/ehon-core/', import.meta.url));
const manifest = JSON.parse(await readFile(`${source}/package.json`, 'utf8'));
const declarations = await readFile(`${source}/${manifest.types}`, 'utf8');
if (/\bany\b/.test(declarations)) throw new Error('The generated facade leaks an untyped API.');
// Keep the directory itself so pnpm's link survives a core rebuild.
await mkdir(destination, { recursive: true });
for (const entry of await readdir(destination)) await rm(`${destination}/${entry}`, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
const licenses = fileURLToPath(new URL('../web/public/licenses/', import.meta.url));
await mkdir(licenses, { recursive: true });
for (const name of ['OFL-Yomogi.txt', 'OFL-ZenMaruGothic.txt']) {
  await cp(new URL(`../iosApp/Ehon/Fonts/${name}`, import.meta.url), `${licenses}/${name}`);
}
console.log('Staged Kotlin/JS and generated TypeScript definitions in web/vendor/ehon-core');
