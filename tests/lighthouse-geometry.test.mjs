import assert from 'node:assert/strict'
import test from 'node:test'
import { Box3, Group, Matrix4 } from 'three'
import { createLighthouseGeometry } from '../src/iphone-duo/diorama/lighthouse-geometry.ts'

test('diorama fits both pages, grows from building bases, and owns its resources', () => {
  const scene = createLighthouseGeometry()
  const mount = new Group()
  mount.add(scene.left, scene.right)
  const geometries = new Set()
  const materials = new Set()
  const instances = new Set()
  const textures = new Set()
  let triangles = 0
  let drawCalls = 0
  for (const root of [scene.left, scene.right]) {
    const bounds = new Box3().setFromObject(root, true)
    assert.ok(bounds.min.x >= -0.48 && bounds.max.x <= 0.48)
    assert.ok(bounds.min.y >= -0.67 && bounds.max.y <= 0.67)
    assert.ok(bounds.min.z >= -0.000001 && bounds.max.z <= 0.86)
    root.traverse(object => {
      if (!object.isMesh) return
      drawCalls++
      geometries.add(object.geometry)
      if (object.isInstancedMesh) instances.add(object)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material)
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value)
      }
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3
        * (object.isInstancedMesh ? object.count : 1)
    })
  }
  assert.ok(triangles < 120_000, `triangle budget exceeded: ${triangles}`)
  assert.ok(drawCalls <= 70, `static geometry must be batched: ${drawCalls} draw calls`)
  assert.ok(textures.size >= 4, 'natural surfaces need owned material detail')
  assert.equal(scene.cabins.length, 2)
  assert.equal(scene.lighthouse.length, 1)
  assert.equal(scene.terrain.length, 2)
  const grass = scene.terrain.flatMap(shore => shore.children.filter(child => child.name === 'sparse-salt-grass'))
  assert.equal(grass.length, 2)
  const initialGrass = grass.map(field => Array.from({ length: field.count }, (_, index) => {
    const matrix = new Matrix4()
    field.getMatrixAt(index, matrix)
    return matrix.clone()
  }))
  const lantern = scene.lighthouse[0].getObjectByName('warm-lantern-light')
  assert.ok(lantern?.isPointLight)
  const baselineIntensity = lantern.intensity
  scene.update(2.4, true)
  assert.notEqual(lantern.intensity, baselineIntensity)
  grass.forEach((field, fieldIndex) => {
    for (let index = 0; index < field.count; index++) {
      const moved = new Matrix4()
      field.getMatrixAt(index, moved)
      assert.notDeepEqual(moved.elements, initialGrass[fieldIndex][index].elements)
      assert.deepEqual(moved.elements.slice(12, 15), initialGrass[fieldIndex][index].elements.slice(12, 15),
        'grass sways around its planted base')
    }
  })
  scene.update(2.4, false)
  assert.equal(lantern.intensity, baselineIntensity)
  grass.forEach((field, fieldIndex) => {
    for (let index = 0; index < field.count; index++) {
      const restored = new Matrix4()
      field.getMatrixAt(index, restored)
      assert.deepEqual(restored.elements, initialGrass[fieldIndex][index].elements,
        'disabled motion restores the authored transform exactly')
    }
  })
  for (const shore of scene.terrain) {
    assert.ok(new Box3().setFromObject(shore, true).min.y > -0.02, 'keep the foreground clear for open water')
  }
  for (const cabin of scene.cabins) {
    const bounds = new Box3().setFromObject(cabin, true)
    assert.ok(bounds.max.x - bounds.min.x < 0.15, 'the red huts are small guardhouses')
  }
  for (const building of [...scene.cabins, ...scene.lighthouse]) {
    const base = building.position.z
    assert.ok(Math.abs(new Box3().setFromObject(building, true).min.z - base) < 0.000001)
    building.scale.z = 0
    const collapsed = new Box3().setFromObject(building, true)
    assert.ok(Math.abs(collapsed.max.z - base) < 0.000001)
    assert.ok(Math.abs(collapsed.min.z - base) < 0.000001)
  }
  const disposalCounts = new Map()
  for (const resource of [...geometries, ...materials, ...instances, ...textures]) {
    resource.addEventListener('dispose', () => disposalCounts.set(resource, (disposalCounts.get(resource) ?? 0) + 1))
  }
  scene.dispose()
  scene.dispose()
  assert.equal(scene.left.parent, null)
  assert.equal(scene.right.parent, null)
  assert.equal(mount.children.length, 0)
  for (const resource of [...geometries, ...materials, ...instances, ...textures]) assert.equal(disposalCounts.get(resource), 1)
})
