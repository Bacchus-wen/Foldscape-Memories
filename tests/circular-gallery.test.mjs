import assert from 'node:assert/strict';
import test from 'node:test';
import CircularGallery, { circularGalleryPose, receptionBounds } from '../src/iphone-duo/react-bits/CircularGallery.js';
import { PerspectiveCamera, Scene, Texture, Vector4 } from 'three';
import { samplePhotoJourney } from '../src/iphone-duo/photo-journey.js';

test('all cards approach the cover without enlarging and return along the same path', () => {
  const scene = new Scene(), camera = new PerspectiveCamera(30, 1.6, .1, 100);
  camera.position.z = 36; camera.updateMatrixWorld();
  const photos = Array.from({ length: 5 }, () => ({ crop: [0, 0, 1, 1] }));
  const textures = new Map(photos.map((_, i) => [i, new Texture({ width: 150, height: 100 })]));
  const gallery = new CircularGallery({ scene, photos, textures, element: { clientWidth: 1440, clientHeight: 900, width: 1440 } });
  const frame = samplePhotoJourney(3, 5);
  const sample = retraction => {
    gallery.update(frame, true, false, retraction);
    gallery.project(camera, new Vector4(-.3, -.3, .6, .6), .99);
    return gallery.medias.map(media => ({ x: media.plane.position.x, width: media.plane.scale.x }));
  };
  try {
    const start = sample(0), middle = sample(.5);
    for (const [i, card] of middle.entries()) {
      assert.ok(Math.abs(card.x) <= Math.abs(start[i].x));
      assert.ok(card.width <= start[i].width);
    }
    const end = sample(1);
    assert.equal(gallery.root.visible, false);
    assert.ok(end.every(card => card.x === 0));
    assert.deepEqual(sample(.5), middle);
    assert.deepEqual(sample(0), start);
    assert.equal(gallery.root.visible, true);
  } finally { gallery.dispose(); textures.forEach(texture => texture.dispose()); }
});

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
