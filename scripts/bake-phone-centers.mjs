import { AnimationMixer, Box3, Group, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { fillRearPanelOpenings } from '../src/iphone-duo/rear-panel.ts'

export async function bakePhoneCenters(json, bin) {
  const data = structuredClone(json)
  data.buffers[0].uri = 'data:application/octet-stream;base64,' + bin.toString('base64')
  for (const mesh of data.meshes) for (const primitive of mesh.primitives) delete primitive.material
  data.materials = []; data.images = []; data.textures = []
  globalThis.ProgressEvent ??= class { constructor(type, values) { this.type = type; Object.assign(this, values) } }
  const source = await new GLTFLoader().parseAsync(JSON.stringify(data), '')
  const body = new Group()
  body.add(source.scene); source.scene.rotation.x = Math.PI / 2
  fillRearPanelOpenings(source.scene)
  const clip = source.animations.find(clip => clip.name === 'Slider')
  const mixer = new AnimationMixer(body), action = mixer.clipAction(clip)
  action.play(); action.paused = true
  const samples = [], bounds = new Box3()
  for (let i = 0; i <= 24; i++) {
    action.time = i / 24 * clip.duration; mixer.update(0); body.updateMatrixWorld(true)
    samples.push(bounds.setFromObject(body, true).getCenter(new Vector3()).toArray())
  }
  mixer.stopAllAction(); mixer.uncacheRoot(body)
  body.traverse(object => { object.geometry?.dispose(); object.material?.dispose() })
  return samples
}
