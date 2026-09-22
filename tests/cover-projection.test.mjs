import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { loadPhoneFixture } from './helpers/phone-fixture.mjs';
import { createCoverProjection } from '../src/iphone-duo/cover-projection.js';

test('stationary photo scrolling reuses exact bounds; camera, rotation and fold invalidate them', async () => {
  const rig = await loadPhoneFixture();
  const mesh = rig.host.getObjectByName('skeleton_0_7_outerDisplayScreenTexture_geo');
  const camera = new PerspectiveCamera(30, 1.4, .1, 100);
  camera.position.z = 36;
  let calls = 0;
  const original = mesh.getVertexPosition.bind(mesh);
  mesh.getVertexPosition = (i, p) => { calls++; return original(i, p); };
  const project = createCoverProjection(mesh);
  const point = new Vector3();
  for (let i = 0; i <= 24; i++) {
    rig.fold(i / 24);
    rig.host.rotation.z = i * .01;
    camera.zoom = 1 + i * .015;
    camera.updateProjectionMatrix();
    const result = project(camera);
    let left = Infinity, bottom = Infinity, right = -Infinity, top = -Infinity, far = -Infinity;
    for (let j = 0; j < mesh.geometry.attributes.position.count; j++) {
      original(j, point).applyMatrix4(mesh.matrixWorld).project(camera);
      left = Math.min(left, point.x); right = Math.max(right, point.x);
      bottom = Math.min(bottom, point.y); top = Math.max(top, point.y); far = Math.max(far, point.z);
    }
    assert.deepEqual(result.bounds.toArray(), [left, bottom, right - left, top - bottom]);
    assert.equal(result.depth, far);
    const previous = calls;
    for (let repeat = 0; repeat < 10; repeat++) project(camera);
    assert.equal(calls, previous, 'unchanged frames must not skin or project vertices again');
  }
  for (const change of [
    () => { camera.position.x += 1; },
    () => { camera.zoom += .1; camera.updateProjectionMatrix(); },
    () => { rig.host.rotation.z += .1; },
    () => { rig.fold(.35); },
  ]) {
    const previous = calls;
    change(); project(camera);
    assert.ok(calls > previous, 'each independent view or rig change invalidates the cache');
  }
});
