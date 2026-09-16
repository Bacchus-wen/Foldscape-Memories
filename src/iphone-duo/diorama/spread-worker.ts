import { MeshBasicMaterial } from 'three'
import { createSpreadLayout } from './spread-layout.ts'
import { packScene, unpackScene } from './spread-worker-data.js'

self.onmessage = ({ data }) => {
  try {
    const materials = Array.from({ length: data.materialCount }, () => new MeshBasicMaterial())
    const result = createSpreadLayout(unpackScene(data.scene, materials), data.id)
    const scene = packScene([result.left, result.right], materials)
    self.postMessage({ scene, composition: result.composition }, { transfer: scene.buffers })
  } catch (error) { self.postMessage({ error: String(error) }) }
}
