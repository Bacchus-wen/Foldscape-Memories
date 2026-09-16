import { packScene, restoreSpread } from './spread-worker-data.js';

export function createSpreadLayoutAsync(nodes, id) {
  return new Promise((resolve, reject) => {
    const materials = [], scene = packScene(nodes, materials, true);
    const worker = new Worker(new URL('./spread-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else {
        try { resolve(restoreSpread(data.scene, materials, data.composition)); }
        catch (error) { reject(error); }
      }
    };
    worker.onerror = event => { worker.terminate(); reject(new Error(event.message)); };
    worker.postMessage({ scene, id, materialCount: materials.length }, scene.buffers);
  });
}
