import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { createPhotoTransition } from '../src/iphone-duo/photo-transition.js';

test('rapid selection finishes the visible blend then serves only the latest photo', async () => {
  const frames = [], states = [];
  const driver = createPhotoTransition({ count: 4, reduced: true, onFrame: v => frames.push(v), onState: v => states.push(v) });
  try {
    driver.select(1);
    await sleep(50);
    driver.select(2);
    driver.select(3);
    await sleep(380);
    assert.deepEqual(states.at(-1), { index: 3, target: 3, busy: false });
    assert.ok(frames.some(f => f.current === 0 && f.target === 1 && f.progress > 0 && f.progress < 1));
    assert.ok(frames.some(f => f.current === 1 && f.target === 3));
    assert.ok(!frames.some(f => f.target === 2));
  } finally { driver.dispose(); }
});

test('return to lighthouse queues behind an in-flight switch without a false settled state', async () => {
  const states = [];
  const driver = createPhotoTransition({ count: 4, reduced: true, onFrame() {}, onState: v => states.push(v) });
  try {
    driver.select(1);
    driver.select(0);
    await sleep(380);
    assert.deepEqual(states.filter(s => !s.busy), [{ index: 0, target: 0, busy: false }]);
  } finally { driver.dispose(); }
});

test('hidden playback pauses; disposal prevents further frames or callbacks', async () => {
  let frames = 0;
  const states = [];
  const driver = createPhotoTransition({ count: 4, reduced: true, onFrame() { frames++; }, onState: v => states.push(v) });
  driver.select(-1);
  driver.setPaused(true);
  const pausedFrames = frames;
  await sleep(220);
  assert.equal(frames, pausedFrames);
  driver.setPaused(false);
  await sleep(35);
  assert.ok(frames > pausedFrames);
  driver.dispose();
  const disposedFrames = frames;
  await sleep(220);
  assert.equal(frames, disposedFrames);
  assert.ok(states.every(s => s.busy));
});
