import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameBudget, scenePixelRatio } from '../src/iphone-duo/frame-budget.js';

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
