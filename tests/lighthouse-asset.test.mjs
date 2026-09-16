import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, MeshPhysicalMaterial, Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { prepareLighthouseAsset } from '../src/iphone-duo/diorama/lighthouse-asset.ts'
import { createPageAnchors } from '../src/iphone-duo/diorama/page-anchors.ts'
import { loadPhoneFixture } from './helpers/phone-fixture.mjs'

test('GLB keeps authored page positions and relative scale through the Y-up conversion', () => {
  const scene = new Group()
  const geometry = new BoxGeometry(.2, .5, .15).translate(0,.25,0)
  const texture = new Texture()
  const material = new MeshStandardMaterial({ map: texture })
  const names = ['Lighthouse', 'Cabin0', 'Cabin1', 'TerrainLeft', 'TerrainRight']
  for (const [index, name] of names.entries()) {
    const root = new Group()
    root.name = name
    root.position.set(index * .08 - .1, .04, -.12)
    const mesh = new Mesh(geometry, material)
    root.add(mesh)
    scene.add(root)
  }
  const asset = prepareLighthouseAsset(scene)
  assert.equal(asset.nodes.length, 5)
  for (const [index,node] of asset.nodes.entries()) {
    const bounds = new Box3().setFromObject(node)
    assert.ok(Math.abs(bounds.min.z-.04) < 1e-6, 'authored base height is retained')
    assert.ok(Math.abs((bounds.min.x+bounds.max.x)/2-(index*.08-.1)) < 1e-6, 'no independent recentering')
    assert.ok(Math.abs((bounds.min.y+bounds.max.y)/2-.12) < 1e-6)
    assert.ok(Math.abs(bounds.max.z-.54) < 1e-6, 'no per-module rescaling')
    node.scale.z=.2
    assert.ok(Math.abs(new Box3().setFromObject(node).min.z-.04) < 1e-6, 'growth preserves the mounted base')
  }
  const counts = new Map()
  for (const resource of [geometry, material, texture]) {
    resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) ?? 0) + 1))
  }
  asset.dispose()
  asset.dispose()
  for (const resource of [geometry, material, texture]) assert.equal(counts.get(resource), 1)
})

test('an incomplete asset is rejected before replacing the procedural scene', () => {
  assert.throws(() => prepareLighthouseAsset(new Group()), /missing.*Lighthouse/i)
})

test('small scene glazing stays transparent without requesting full-scene transmission passes', () => {
  const scene = new Group()
  const glass = new MeshPhysicalMaterial({ transmission: .9, roughness: .08 })
  const geometry = new BoxGeometry()
  const panes = []
  for (const name of ['Lighthouse', 'Cabin0', 'Cabin1', 'TerrainLeft', 'TerrainRight']) {
    const node = new Group(); node.name = name
    const pane = new Mesh(geometry, glass); panes.push(pane)
    node.add(pane); scene.add(node)
  }
  const asset = prepareLighthouseAsset(scene)
  assert.equal(glass.transmission, 0)
  assert.equal(glass.transparent, true)
  assert.ok(glass.opacity > 0 && glass.opacity < .3)
  assert.equal(glass.depthWrite, false)
  assert.ok(panes.every(pane => !pane.castShadow))
  assert.equal(glass.roughness, .08)
  asset.dispose()
})

for (const sceneFile of ['lighthouse/lighthouse-memory-v2.glb', 'iceberg/iceberg-memory.glb', 'coastal-house/coastal-house-memory.glb', 'santorini/santorini-memory.glb', 'osaka-castle/osaka-castle-memory.glb']) test(`delivered scene ${sceneFile} meets the phone hinge and follows folding`, async () => {
  const bytes = await readFile(new URL(`../public/scenes/${sceneFile}`, import.meta.url))
  const jsonLength = bytes.readUInt32LE(12)
  const data = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString())
  const binOffset = 20 + jsonLength
  data.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(binOffset + 8, binOffset + 8 + bytes.readUInt32LE(binOffset)).toString('base64')
  // Exercise the delivered geometry and transforms. Textures are checked in the real browser.
  for (const mesh of data.meshes) for (const primitive of mesh.primitives) delete primitive.material
  data.materials = []; data.images = []; data.textures = []
  if (!globalThis.ProgressEvent) globalThis.ProgressEvent = class { constructor(type, values) { this.type = type; Object.assign(this, values) } }
  const gltf = await new GLTFLoader().parseAsync(JSON.stringify(data), '')
  const asset = prepareLighthouseAsset(gltf.scene)
  const { host, screen, fold } = await loadPhoneFixture()
  const anchors = createPageAnchors(screen, host)
  anchors.left.add(asset.left); anchors.right.add(asset.right)
  anchors.update()
  const left = new Box3().setFromObject(asset.terrain[0])
  const right = new Box3().setFromObject(asset.terrain[1])
  if (asset.lighthouse[0].userData.rigidCluster) {
    const bounds = new Box3().setFromObject(asset.lighthouse[0])
    assert.ok(!bounds.isEmpty(), 'the intact architectural cluster has geometry')
    assert.ok(Number.isFinite(bounds.max.z), 'the delivered cluster has finite bounds')
  } else assert.ok(Math.abs(left.max.x - right.min.x) < .04, 'authored shore edges meet at the actual hinge')
  if (sceneFile.startsWith('lighthouse')) assert.ok(asset.lighthouse[0].getObjectByName('LanternLightAnchor'), 'lamp has an authored mount')
  if (sceneFile.startsWith('iceberg')) {
    const vessel = new Box3().setFromObject(asset.lighthouse[0])
    assert.ok(!vessel.isEmpty(), 'the vessel has actual geometry')
    const vesselLocal = new Box3().setFromObject(asset.lighthouse[0].children[0])
    assert.ok(Number.isFinite(vesselLocal.min.x), 'vessel geometry is finite')
  }
  const local = asset.lighthouse[0].position.clone()
  for (const progress of [.2,.5,.85,1,.3,0]) {
    fold(progress); anchors.update()
    const expected = local.clone().applyMatrix4(anchors.right.matrixWorld)
    const actual = asset.lighthouse[0].getWorldPosition(new Vector3())
    assert.ok(actual.distanceTo(expected) < 1e-5, 'tower follows the right screen without recentering')
  }
  asset.dispose(); anchors.dispose()
})

