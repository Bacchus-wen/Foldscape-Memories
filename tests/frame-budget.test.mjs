import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameBudget, scenePixelRatio } from '../src/iphone-duo/frame-budget.js';
import { PerspectiveCamera, Vector3 } from 'three';
import { frameSceneCamera, sceneFrameAdjustment } from '../src/iphone-duo/frame-camera.js';

test('full-page camera preserves photograph framing while allowing scenery above the old crop', () => {
  for (const [width, height, top, bottom] of [[1440, 900, 222, 160], [390, 800, 270, 248]]) {
    const framedHeight = height - top - bottom;
    const old = new PerspectiveCamera(2 * Math.atan(Math.max(16, 21 / (width / framedHeight)) / 72) * 180 / Math.PI, width / framedHeight, .1, 100);
    old.position.z = 36; old.zoom = 1.5; old.updateProjectionMatrix(); old.updateMatrixWorld();
    const expanded = old.clone();
    frameSceneCamera(expanded, width, height, top, bottom);
    for (const point of [new Vector3(), new Vector3(4, 3, 1), new Vector3(-3, 7, 0)]) {
      const a = point.clone().project(old), b = point.clone().project(expanded);
      assert.ok(Math.abs((a.x + 1) * width / 2 - (b.x + 1) * width / 2) < 1e-8);
      assert.ok(Math.abs(top + (1 - a.y) * framedHeight / 2 - (1 - b.y) * height / 2) < 1e-8);
    }
    const aboveFrame = new Vector3(0, 1.1, 0).unproject(old).project(expanded);
    assert.ok(aboveFrame.y < 1, 'content above the old canvas is now visible');
  }
});

test('high refresh displays draw at 60 fps without a 144 Hz to 48 fps rounding trap', () => {
  for (const hz of [60, 120, 144, 240]) {
    const ready = createFrameBudget();
    let frames = 0;
    for (let n = 0; n < hz * 3; n++) if (ready(n * 1000 / hz)) frames++;
    assert.ok(frames >= 179 && frames <= 181, `${hz} Hz produced ${frames} draws`);
  }
});

test('slower devices and a return after idle draw immediately without catch-up bursts', () => {
  const ready = createFrameBudget();
  for (const time of [0, 34, 68, 102, 5000]) assert.equal(ready(time), true);
  assert.equal(ready(5001), false);
  assert.equal(ready(5017), true);
});

test('scene render resolution stays within two million pixels without oversampling the display', () => {
  for (const [width, height, dpr] of [[614, 440, 2], [1400, 800, 2], [3840, 2160, 2], [390, 500, 1]]) {
    const ratio = scenePixelRatio(width, height, dpr);
    assert.ok(ratio <= Math.min(dpr, 1.5));
    assert.ok(width * height * ratio * ratio <= 2_000_001);
    assert.ok(ratio > 0);
  }
  assert.equal(scenePixelRatio(390, 500, 1), 1);
});

test('unfolded framing scales the scene to 90% and moves it down exactly 20 CSS pixels', () => {
  const camera = new PerspectiveCamera(30, 1, .1, 100);
  camera.position.z = 36; camera.updateMatrixWorld();
  frameSceneCamera(camera, 1440, 900, 222, 160);
  const origin = new Vector3().project(camera);
  const edge = new Vector3(4, 0, 0).project(camera);
  const frame = sceneFrameAdjustment(1);
  camera.zoom *= frame.scale; camera.view.offsetY -= frame.offsetY; camera.updateProjectionMatrix();
  const moved = new Vector3().project(camera);
  const scaled = new Vector3(4, 0, 0).project(camera);
  assert.ok(Math.abs((origin.y - moved.y) * 450 - 20) < 1e-8);
  assert.ok(Math.abs((scaled.x - moved.x) / (edge.x - origin.x) - .9) < 1e-8);
  assert.deepEqual(sceneFrameAdjustment(0), { scale: 1, offsetY: 0 });
  assert.deepEqual(sceneFrameAdjustment(.5), { scale: .95, offsetY: 10 });
});
