import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { MEMORY_PHOTOS } from '../src/iphone-duo/memory-photos.js';

test('all photographs preload from HTML before device initialization, matching texture request mode', async () => {
  const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const photo of MEMORY_PHOTOS) {
    const tag = html.split('\n').find(line => line.includes(`href="${photo.image}"`));
    assert.ok(tag?.includes('as="image"') && tag.includes('crossorigin'));
    assert.ok(tag.includes(`fetchpriority="${photo.id === 'lighthouse' ? 'high' : 'low'}"`));
  }
});

for (const id of ['iceberg', 'coastal-house']) {
  test(`${id} delivery reduces bytes without changing any decoded pixels or crop`, async () => {
    const photo = MEMORY_PHOTOS.find(item => item.id === id);
    assert.match(photo.image, /^\/delivery\/photo-.*\.webp$/);
    assert.deepEqual(photo.crop, [0, .5, 1, .5]);
    const original = await fs.readFile(new URL(`../public/scenes/${id}/source.png`, import.meta.url));
    const delivered = await fs.readFile(new URL(`../public${photo.image}`, import.meta.url));
    const before = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const after = await sharp(delivered).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual(after.info, before.info);
    assert.ok(after.data.equals(before.data));
    assert.ok(delivered.length < original.length * .6);
  });
}
