import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { AnimationMixer, Box3, Group, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { loadPhoneFixture } from './helpers/phone-fixture.mjs'
import assets from '../src/delivery-assets.js'

test('compressed device decodes in the application loader and baked centers preserve all 25 poses', async () => {
  const bytes = await readFile(new URL('../public' + assets.device, import.meta.url))
  const length = bytes.readUInt32LE(12), data = JSON.parse(bytes.subarray(20, 20 + length).toString())
  data.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(28 + length).toString('base64')
  // Use the real compressed rig and attributes, skipping browser-only image decoding.
  for (const mesh of data.meshes) for (const primitive of mesh.primitives) delete primitive.material
  data.materials = []; data.images = []; data.textures = []
  globalThis.ProgressEvent ??= class { constructor(type, values) { this.type = type; Object.assign(this, values) } }
  const source = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(JSON.stringify(data), '')
  const host = new Group(); host.add(source.scene); source.scene.rotation.x = Math.PI / 2
  const mixer = new AnimationMixer(host), clip = source.animations.find(c => c.name === 'Slider')
  const action = mixer.clipAction(clip); action.play(); action.paused = true
  const reference = await loadPhoneFixture()
  const baked = source.scene.userData.foldCenterSamples
  const screen = host.getObjectByName('skeleton_0_3_screenTexture_geo')
  const box = new Box3(), center = new Vector3(), actual = new Vector3(), expected = new Vector3()
  for (let i = 0; i <= 24; i++) {
    reference.fold(i / 24)
    box.setFromObject(reference.host, true).getCenter(center)
    assert.ok(center.distanceTo(new Vector3().fromArray(baked[i])) < 1e-7, `center sample ${i}`)
    action.time = i / 24 * clip.duration; mixer.update(0); host.updateMatrixWorld(true)
    for (let vertex = 0; vertex < screen.geometry.attributes.position.count; vertex += 19) {
      screen.getVertexPosition(vertex, actual).applyMatrix4(screen.matrixWorld)
      reference.screen.getVertexPosition(vertex, expected).applyMatrix4(reference.screen.matrixWorld)
      assert.ok(actual.distanceTo(expected) < 1e-7, `skinned screen vertex ${vertex} at pose ${i}`)
    }
  }
})
