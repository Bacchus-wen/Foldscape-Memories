import assert from 'node:assert/strict'
import test from 'node:test'
import { Group, PerspectiveCamera, Scene } from 'three'
import { createCoastalWater } from '../src/iphone-duo/diorama/coastal-water.ts'

test('two moving water planes avoid recursive reflections and release all GPU resources', () => {
  const scene = new Scene()
  const left = new Group(), right = new Group()
  left.position.x = -.55
  right.position.x = .55
  scene.add(left, right)
  const water = createCoastalWater(left, right, 64)
  const camera = new PerspectiveCamera(40, 1, .1, 100)
  camera.position.z = 4
  camera.updateMatrixWorld()
  scene.updateMatrixWorld(true)
  let reflectedPasses = 0
  let renderTarget = null
  const renderer = {
    xr: { enabled: false }, shadowMap: { autoUpdate: true }, autoClear: true,
    getRenderTarget: () => renderTarget,
    setRenderTarget: target => { renderTarget = target },
    state: { buffers: { depth: { setMask() {} } } },
    render(_scene, reflectionCamera) {
      reflectedPasses++
      assert.equal(reflectionCamera.layers.isEnabled(0), false, 'water must not redraw the entire phone and photo gallery');
      assert.equal(reflectionCamera.layers.isEnabled(1), true, 'architecture remains in the reflection');
      assert.ok([...left.children, ...right.children].every(surface => !surface.visible))
    },
  }
  for (const reflector of water.waters) reflector.onBeforeRender(renderer, scene, camera)
  assert.equal(reflectedPasses, 2)
  assert.equal(renderTarget, null)
  assert.ok([...left.children, ...right.children].every(surface => surface.visible))
  water.update(0)
  assert.ok([...left.children, ...right.children].every(surface => !surface.visible))
  water.update(.8)
  assert.ok([...left.children, ...right.children].every(surface => surface.visible))
  const timeUniforms = water.waters.map(reflector => reflector.material.uniforms.time)
  water.update(.8, 3.25, true)
  assert.deepEqual(timeUniforms.map(uniform => uniform.value), [3.25, 3.25])
  water.update(.8, 8, false)
  assert.deepEqual(timeUniforms.map(uniform => uniform.value), [0, 0],
    'disabled motion keeps the original static shader phase')
  const resources = new Set([...left.children, ...right.children].flatMap(surface => [surface.geometry, surface.material]))
  water.waters.forEach(reflector => resources.add(reflector.getRenderTarget()))
  const counts = new Map()
  resources.forEach(resource => resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) || 0) + 1)))
  water.dispose()
  water.dispose()
  assert.equal(left.children.length + right.children.length, 0)
  resources.forEach(resource => assert.equal(counts.get(resource), 1))
})
