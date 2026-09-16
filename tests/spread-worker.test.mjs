import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, PointLight } from 'three';
import { createSpreadLayout } from '../src/iphone-duo/diorama/spread-layout.ts';
import { packScene, unpackScene, restoreSpread } from '../src/iphone-duo/diorama/spread-worker-data.js';

test('worker transfer preserves page geometry, materials, lights and reversible folding', () => {
  const material = new MeshStandardMaterial({ color: '#cc3322' });
  const nodes = Array.from({ length: 5 }, (_, i) => {
    const node = new Group(); node.position.set(i * .1, 0, .2);
    node.add(new Mesh(new BoxGeometry(.3, .3, .4), material)); return node;
  });
  nodes[0].add(new PointLight('#ffc978', .02));
  const materials = [];
  const packed = packScene(nodes, materials, true);
  const wire = structuredClone(packed, { transfer: packed.buffers });
  assert.equal(nodes[0].children[0].geometry.attributes.position.array.byteLength > 0, true, 'source geometry stays attached');
  const decoded = unpackScene(wire, materials);
  const expected = createSpreadLayout(nodes.map(node => node.clone()), 'lighthouse');
  const calculated = createSpreadLayout(decoded, 'lighthouse');
  const result = packScene([calculated.left, calculated.right], materials);
  const restored = restoreSpread(structuredClone(result, { transfer: result.buffers }), materials, calculated.composition);
  assert.equal(restored.lights.length, 1);
  for (const progress of [0, .2, .5, 1, .5, 0]) {
    expected.animate(progress); restored.animate(progress);
    for (const key of ['left', 'right']) {
      assert.deepEqual(new Box3().setFromObject(restored[key]), new Box3().setFromObject(expected[key]));
      restored[key].traverse(object => { if (object.isMesh) assert.equal(object.material, material); });
    }
  }
  restored.dispose(); restored.dispose(); expected.dispose(); calculated.dispose();
});

test('the actual worker completes without blocking the main event loop', async () => {
  const material = new MeshStandardMaterial();
  const nodes = Array.from({ length: 5 }, () => new Group().add(new Mesh(new BoxGeometry(1, 1, 1, 24, 24, 24), material)));
  const materials = [], scene = packScene(nodes, materials, true);
  const worker = new Worker(new URL('./helpers/spread-worker.mjs', import.meta.url));
  let responsive = false;
  setImmediate(() => { responsive = true; });
  try {
    const result = await new Promise((resolve, reject) => {
      worker.once('message', resolve); worker.once('error', reject);
      worker.postMessage({ scene, id: 'lighthouse', materialCount: materials.length }, scene.buffers);
    });
    assert.equal(result.error, undefined);
    assert.equal(responsive, true);
    const asset = restoreSpread(result.scene, materials, result.composition);
    asset.animate(1);
    assert.equal(new Box3().setFromObject(asset.left).isEmpty(), false);
    assert.equal(new Box3().setFromObject(asset.right).isEmpty(), false);
    asset.dispose();
  } finally { await worker.terminate(); }
});
