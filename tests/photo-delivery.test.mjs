import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { MEMORY_PHOTOS } from '../src/iphone-duo/memory-photos.js';

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
