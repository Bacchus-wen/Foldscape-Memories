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
import { Scene, Texture, TextureLoader } from 'three';
import { createCoverMorph, createMorphUniforms } from '../src/iphone-duo/cover-morph.js';

test('photographs become browsable before scene preparation finishes', async () => {
  const original = TextureLoader.prototype.loadAsync;
  TextureLoader.prototype.loadAsync = async () => new Texture({ width: 120, height: 80 });
  let release, morph;
  const warming = new Promise(resolve => { release = resolve; });
  const states = [];
  try {
    morph = createCoverMorph({ material: { uniforms: createMorphUniforms() },
      photos: [0, 1].map(index => ({ image: `${index}.jpg`, crop: [0, 0, 1, 1] })),
      scene: new Scene(), element: { dataset: {} }, draw() {},
      onState: state => states.push(state), warmup: () => warming });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(states.at(-1).ready, true, 'model warmup must not lock photo browsing');
    assert.equal(states.at(-1).prepared, false, 'opening still waits for GPU preparation');
    morph.seek(1.5);
    assert.equal(states.at(-1).busy, true, 'input works while preparation is pending');
    release();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(states.at(-1).prepared, true);
  } finally { release(); morph?.dispose(); TextureLoader.prototype.loadAsync = original; }
});

test('leaving during preparation stops callbacks but keeps shader resources alive until compilation ends', async () => {
  const original = TextureLoader.prototype.loadAsync;
  let disposed = 0, release, morph;
  TextureLoader.prototype.loadAsync = async () => {
    const texture = new Texture({ width: 120, height: 80 });
    texture.addEventListener('dispose', () => disposed++); return texture;
  };
  const warming = new Promise(resolve => { release = resolve; }), states = [];
  try {
    morph = createCoverMorph({ material: { uniforms: createMorphUniforms() },
      photos: [0, 1].map(index => ({ image: `${index}.jpg`, crop: [0, 0, 1, 1] })),
      scene: new Scene(), element: { dataset: {} }, draw() {}, onState: state => states.push(state), warmup: () => warming });
    await sleep(0);
    const count = states.length;
    morph.dispose(warming);
    assert.equal(disposed, 0, 'compileAsync may still read these materials and textures');
    release(); await sleep(0);
    assert.equal(disposed, 2);
    assert.equal(states.length, count, 'unmounted experience must not publish a late ready state');
  } finally { release(); TextureLoader.prototype.loadAsync = original; }
});
