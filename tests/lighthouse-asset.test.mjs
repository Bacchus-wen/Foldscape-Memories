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
  const asset = prepareLighthouseAsset(gltf.scene, sceneFile.split('/')[0])
  const { host, screen, fold } = await loadPhoneFixture()
  const anchors = createPageAnchors(screen, host)
  anchors.left.add(asset.left); anchors.right.add(asset.right)
  anchors.update()
  asset.animate(1)
  host.updateMatrixWorld(true)
  const left = new Box3().setFromObject(asset.left), right = new Box3().setFromObject(asset.right)
  assert.ok(!left.isEmpty()&&!right.isEmpty(), 'the composition occupies both pages')
  const localPages = [asset.left,asset.right].map((page,side)=>{
    const meshes=[]
    page.traverse(o=>{if(o instanceof Mesh)meshes.push(o)})
    for(const mesh of meshes){
      const box=mesh.geometry.boundingBox
      assert.ok(side ? box.min.x>=-.532-1e-5 : box.max.x<=.532+1e-5, 'triangles end at the actual hinge')
    }
    return meshes
  })
  const combined=new Box3()
  localPages.forEach((meshes,side)=>meshes.forEach(mesh=>{
    const box=mesh.geometry.boundingBox.clone().translate(new Vector3(side?.5/.94:-.5/.94,0,0))
    combined.union(box)
  }))
  assert.ok(combined.max.x-combined.min.x>1.4, `large composition spans the full display: ${combined.max.x-combined.min.x}`)
  assert.ok(combined.max.x<=1.01&&combined.min.x>=-1.01, 'keeps the outer bezel clear')
  assert.ok(combined.max.y<=.701&&combined.min.y>=-.701)
  for(const p of [.15,.35,.55,.75,.96,1,.55,0]) {
    fold(p);anchors.update();asset.animate(p);host.updateMatrixWorld(true)
    assert.ok(asset.left.matrixWorld.elements.every(Number.isFinite))
    assert.ok(asset.right.matrixWorld.elements.every(Number.isFinite))
  }
  asset.dispose(); anchors.dispose()
})

