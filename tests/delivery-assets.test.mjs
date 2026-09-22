import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { gunzipSync, brotliDecompressSync } from 'node:zlib'
import delivery from '../src/delivery-assets.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

const sources = {
  device: 'assets/iphone-duo/iphone-duo.gltf',
  lighthouse: 'scenes/lighthouse/lighthouse-memory-v2.glb',
  iceberg: 'scenes/iceberg/iceberg-memory.glb',
  'coastal-house': 'scenes/coastal-house/coastal-house-memory.glb',
  santorini: 'scenes/santorini/santorini-memory.glb',
  'osaka-castle': 'scenes/osaka-castle/osaka-castle-memory.glb',
}
function unpack(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67)
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  const end = 20 + bytes.readUInt32LE(12)
  return { data: JSON.parse(bytes.subarray(20, end).toString()), bin: bytes.subarray(end + 8) }
}
for (const [id, file] of Object.entries(sources)) test(`${id}: delivery preserves geometry, rig and material settings`, async () => {
  const sourceUrl = new URL('../public/' + file, import.meta.url)
  const bytes = await fs.readFile(sourceUrl)
  const source = file.endsWith('.glb') ? unpack(bytes) : { data: JSON.parse(bytes.toString()) }
  source.bin ??= await fs.readFile(new URL(source.data.buffers[0].uri, sourceUrl))
  const deliveryUrl = new URL('../public' + delivery[id], import.meta.url)
  const encoded = await fs.readFile(deliveryUrl), target = unpack(encoded)
  for (const key of ['nodes', 'meshes', 'skins', 'animations', 'materials', 'accessors']) {
    assert.deepEqual(target.data[key], source.data[key], `${key} changed`)
  }
  const images = new Set(source.data.images.map(image => image.bufferView))
  for (let i = 0; i < source.data.bufferViews.length; i++) {
    if (images.has(i)) continue
    const a = source.data.bufferViews[i], b = target.data.bufferViews[i]
    let decoded = target.bin.subarray(b.byteOffset, b.byteOffset + b.byteLength)
    const compressed = b.extensions?.EXT_meshopt_compression
    if (compressed) {
      await MeshoptDecoder.ready
      decoded = Buffer.alloc(b.byteLength)
      MeshoptDecoder.decodeGltfBuffer(decoded, compressed.count, compressed.byteStride,
        target.bin.subarray(compressed.byteOffset, compressed.byteOffset + compressed.byteLength), compressed.mode, compressed.filter)
    }
    assert.deepEqual(decoded,
      source.bin.subarray(a.byteOffset ?? 0, (a.byteOffset ?? 0) + a.byteLength), `binary view ${i}`)
  }
  assert.ok(target.data.images.every(image => !image.uri), 'no texture request waterfall')
  assert.deepEqual(gunzipSync(await fs.readFile(new URL(deliveryUrl.href + '.gz'))), encoded)
  if (id === 'device') {
    assert.ok(target.data.extensionsRequired.includes('EXT_meshopt_compression'), 'device uses exact mesh compression')
    assert.equal(target.data.scenes[target.data.scene ?? 0].extras.foldCenterSamples.length, 25)
    const brotli = await fs.readFile(new URL(deliveryUrl.href + '.br'))
    assert.deepEqual(brotliDecompressSync(brotli), encoded, 'device Brotli must restore exactly the same GLB')
    assert.ok(brotli.length < (await fs.stat(new URL(deliveryUrl.href + '.gz'))).size)
  }
})
