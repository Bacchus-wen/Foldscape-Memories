import { Vector3, Vector4 } from 'three';

// The authored phone mesh is immutable; only its rig and view change at runtime.
// Cache exact projected bounds, not a simplified hull or rounded coordinates.
export function createCoverProjection(mesh) {
  const point = new Vector3();
  const result = { bounds: new Vector4(), depth: 0 };
  const matrices = [mesh.matrixWorld];
  if (mesh.isSkinnedMesh) matrices.push(mesh.bindMatrix, mesh.bindMatrixInverse, ...mesh.skeleton.bones.map(bone => bone.matrixWorld));
  const previous = new Float64Array((matrices.length + 2) * 16).fill(NaN);
  return camera => {
    mesh.updateWorldMatrix(true, false);
    mesh.skeleton?.update();
    camera.updateMatrixWorld();
    let changed = false, offset = 0;
    for (const matrix of [...matrices, camera.matrixWorldInverse, camera.projectionMatrix]) {
      for (const value of matrix.elements) {
        if (previous[offset] !== value) changed = true;
        previous[offset++] = value;
      }
    }
    if (!changed) return result;
    let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity, far = -Infinity;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).project(camera);
      left = Math.min(left, point.x); right = Math.max(right, point.x);
      bottom = Math.min(bottom, point.y); top = Math.max(top, point.y);
      far = Math.max(far, point.z);
    }
    result.bounds.set(left, bottom, right - left, top - bottom);
    result.depth = far;
    return result;
  };
}
