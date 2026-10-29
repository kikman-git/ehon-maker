import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cacheControl, publicKey } from '../assets-worker/src/index.ts';

test('curated catalog pointers refresh while immutable revisions remain cacheable', () => {
  const file = `materials/catalogs/${'a'.repeat(64)}.json`;
  assert.equal(publicKey('/materials/index.json'), 'materials/index.json');
  assert.equal(publicKey(`/${file}`), file);
  assert.equal(cacheControl('materials/index.json'), 'public, max-age=300');
  assert.equal(cacheControl(file), 'public, max-age=31536000, immutable');
  for (const path of ['/materials/source.json', '/materials/catalogs/../index.json', `/materials/catalogs/${'a'.repeat(63)}.json`, '/materials/masters/bird.png', '/materials/catalogs/%2e%2e.json']) assert.equal(publicKey(path), null);
});
