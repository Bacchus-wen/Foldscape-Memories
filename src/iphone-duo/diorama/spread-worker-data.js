import { BufferAttribute, BufferGeometry, Group, Mesh, PointLight } from 'three';
import { spreadFoldMatrix } from './spread-layout.ts';
import { getPopUpState } from './pop-up-motion.ts';

// Transfer only geometry and transforms. GPU textures and real materials stay
// on the main thread; input buffers are copied so the loaded GLB remains valid.
export function packScene(roots, materials, copy = false) {
  const buffers = [], geometries = [], known = new Map();
  const attribute = a => {
    let array;
    if (a.isInterleavedBufferAttribute) {
      array = new a.array.constructor(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) array[i * a.itemSize + j] = a.getComponent(i, j);
    } else array = copy ? a.array.slice() : a.array;
    if (!buffers.includes(array.buffer)) buffers.push(array.buffer);
    return { array, size: a.itemSize, normalized: a.normalized };
  };
  const materialIndex = material => {
    let index = materials.indexOf(material);
    if (index < 0) { index = materials.length; materials.push(material); }
    return index;
  };
  const pack = object => {
    if (object.matrixAutoUpdate) object.updateMatrix();
    const data = { name: object.name, matrix: object.matrix.toArray(), auto: object.matrixAutoUpdate,
      visible: object.visible, userData: object.userData, children: object.children.map(pack) };
    if (object.isMesh) {
      let index = known.get(object.geometry);
      if (index === undefined) {
        index = geometries.length; known.set(object.geometry, index);
        geometries.push({ attributes: Object.fromEntries(Object.entries(object.geometry.attributes).map(([name, a]) => [name, attribute(a)])),
          index: object.geometry.index ? attribute(object.geometry.index) : null, groups: object.geometry.groups });
      }
      Object.assign(data, { geometry: index, material: Array.isArray(object.material) ? object.material.map(materialIndex) : materialIndex(object.material), castShadow: object.castShadow, receiveShadow: object.receiveShadow });
    } else if (object.isPointLight) {
      data.light = { color: object.color.toArray(), intensity: object.intensity, distance: object.distance, decay: object.decay };
    }
    return data;
  };
  return { objects: roots.map(pack), geometries, buffers };
}

export function unpackScene(data, materials) {
  const attribute = a => new BufferAttribute(a.array, a.size, a.normalized);
  const geometries = data.geometries.map(g => {
    const geometry = new BufferGeometry();
    for (const [name, a] of Object.entries(g.attributes)) geometry.setAttribute(name, attribute(a));
    if (g.index) geometry.setIndex(attribute(g.index));
    geometry.groups = g.groups; geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
  });
  const unpack = data => {
    let object;
    if (data.geometry !== undefined) {
      object = new Mesh(geometries[data.geometry], Array.isArray(data.material) ? data.material.map(i => materials[i]) : materials[data.material]);
      object.castShadow = data.castShadow; object.receiveShadow = data.receiveShadow;
    } else if (data.light) {
      object = new PointLight(0xffffff, data.light.intensity, data.light.distance, data.light.decay);
      object.color.fromArray(data.light.color);
    } else object = new Group();
    object.name = data.name; object.userData = data.userData; object.visible = data.visible;
    object.matrix.fromArray(data.matrix); object.matrix.decompose(object.position, object.quaternion, object.scale);
    object.matrixAutoUpdate = data.auto;
    data.children.forEach(child => object.add(unpack(child)));
    return object;
  };
  return data.objects.map(unpack);
}

export function restoreSpread(data, materials, composition) {
  const [left, right] = unpackScene(data, materials), lights = [], geometries = new Set();
  const layers = Object.fromEntries(['terrain', 'cabins', 'lighthouse'].map((name, i) => [name, [left.children[i], right.children[i]]]));
  for (const page of [left, right]) page.traverse(object => {
    if (object.isPointLight) lights.push(object);
    if (object.isMesh) geometries.add(object.geometry);
  });
  let disposed = false;
  return { left, right, ...layers, lights, composition,
    animate(progress) {
      const state = getPopUpState(progress);
      for (const [key, pair] of Object.entries(layers)) pair.forEach((group, side) => {
        group.matrix.copy(spreadFoldMatrix(progress, side, key, group.userData.clearance, group.userData.height));
        group.visible = state[key] > .001;
      });
    },
    dispose() { if (disposed) return; disposed = true; left.removeFromParent(); right.removeFromParent(); geometries.forEach(g => g.dispose()); },
  };
}
