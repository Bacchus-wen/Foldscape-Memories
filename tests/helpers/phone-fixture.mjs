import { readFile } from 'node:fs/promises'
import { AnimationMixer, Group } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export async function loadPhoneFixture() {
  const base = new URL('../../public/assets/iphone-duo/', import.meta.url)
  const data = JSON.parse(await readFile(new URL('iphone-duo.gltf', base), 'utf8'))
  for (const buffer of data.buffers) {
    buffer.uri = 'data:application/octet-stream;base64,' + (await readFile(new URL(buffer.uri, base))).toString('base64')
  }
  // The fixture retains the real rig and geometry; no browser textures needed.
  for (const mesh of data.meshes) for (const primitive of mesh.primitives) delete primitive.material
  data.materials = []; data.images = []; data.textures = []
  if (!globalThis.ProgressEvent) globalThis.ProgressEvent = class { constructor(type, values) { this.type = type; Object.assign(this, values) } }
  const source = await new GLTFLoader().parseAsync(JSON.stringify(data), '')
  const host = new Group()
  host.add(source.scene)
  source.scene.rotation.x = Math.PI / 2
  const mixer = new AnimationMixer(source.scene)
  const clip = source.animations.find(clip => clip.name === 'Slider')
  const action = mixer.clipAction(clip)
  action.play(); action.paused = true
  const screen = source.scene.getObjectByName('skeleton_0_3_screenTexture_geo')
  const fold = p => {
    action.time = p * clip.duration
    mixer.update(0)
    host.updateMatrixWorld(true)
    screen.skeleton.update()
  }
  fold(1)
  return { host, source, screen, fold }
}
