import assert from 'node:assert/strict';
import test from 'node:test';
import { circularGalleryPose, receptionBounds } from '../src/iphone-duo/react-bits/CircularGallery.js';

test('gallery photographs occupy different depths and face along the circle', () => {
  const near = circularGalleryPose(.7), far = circularGalleryPose(1.6);
  assert.ok(near.z < 0 && far.z < near.z);
  assert.ok(far.yaw > near.yaw && near.yaw > 0);
  assert.ok(far.y > near.y);
  const left = circularGalleryPose(-.7);
  assert.equal(left.x, -near.x);
  assert.equal(left.yaw, -near.yaw);
  assert.equal(left.z, near.z);
});

test('receiving gap stays twenty CSS pixels beyond the bezel at different widths', () => {
  for (const width of [390, 614, 1440]) {
    const withoutGap = receptionBounds(-.4, .4, width, 0);
    const withGap = receptionBounds(-.4, .4, width);
    assert.ok(Math.abs(withoutGap[0] - withGap[0] - 20) < 1e-8);
    assert.ok(Math.abs(withGap[1] - withoutGap[1] - 20) < 1e-8);
  }
});
