import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync, brotliCompressSync, constants } from 'node:zlib'
import sharp from 'sharp'

// Keep authoring assets intact. Only encode smaller, pixel-identical textures;
// geometry, animation, UVs, material settings and image dimensions are retained.
const root = path.resolve(import.meta.dirname, '..')
const output = path.join(root, 'public/delivery')
await fs.mkdir(output, { recursive: true })
const sources = {
  device: 'assets/iphone-duo/iphone-duo.gltf',
  lighthouse: 'scenes/lighthouse/lighthouse-memory-v2.glb',
  iceberg: 'scenes/iceberg/iceberg-memory.glb',
  'coastal-house': 'scenes/coastal-house/coastal-house-memory.glb',
  santorini: 'scenes/santorini/santorini-memory.glb',
  'osaka-castle': 'scenes/osaka-castle/osaka-castle-memory.glb',
}
const urls = {}, report = []
for (const [id, relative] of Object.entries(sources)) {
  const file = path.join(root, 'public', relative), original = await fs.readFile(file)
  const packed = relative.endsWith('.glb')
  const jsonLength = packed ? original.readUInt32LE(12) : 0
  const data = JSON.parse(packed ? original.subarray(20, 20 + jsonLength).toString() : original.toString())
  const bin = packed ? original.subarray(28 + jsonLength) : await fs.readFile(path.join(path.dirname(file), data.buffers[0].uri))
  const replacements = new Map()
  let inputBytes = packed ? original.length : original.length + bin.length
  for (let index = 0; index < (data.images?.length ?? 0); index++) {
    const image = data.images[index]
    let bytes
    if (image.uri) {
      bytes = await fs.readFile(path.join(path.dirname(file), image.uri))
      inputBytes += bytes.length
      image.mimeType ??= image.uri.endsWith('.avif') ? 'image/avif' : image.uri.endsWith('.png') ? 'image/png' : 'image/jpeg'
      delete image.uri
      image.bufferView = data.bufferViews.length
      data.bufferViews.push({ buffer: 0, byteLength: bytes.length })
    } else {
      const view = data.bufferViews[image.bufferView]
      bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
    }
    if (image.mimeType === 'image/png') {
      const webp = await sharp(bytes).webp({ lossless: true, effort: 6 }).toBuffer()
      // Verify decoded pixels, including alpha, before choosing a new encoding.
      const before = await sharp(bytes).ensureAlpha().raw().toBuffer()
      const after = await sharp(webp).ensureAlpha().raw().toBuffer()
      if (webp.length < bytes.length && before.equals(after)) {
        bytes = webp
        image.mimeType = 'image/webp'
        data.extensionsUsed = [...new Set([...(data.extensionsUsed ?? []), 'EXT_texture_webp'])]
        data.extensionsRequired = [...new Set([...(data.extensionsRequired ?? []), 'EXT_texture_webp'])]
        for (const texture of data.textures ?? []) if (texture.source === index) {
          texture.extensions = { ...texture.extensions, EXT_texture_webp: { source: index } }
          delete texture.source
        }
      }
    }
    replacements.set(image.bufferView, bytes)
  }
  const parts = []; let offset = 0
  for (let index = 0; index < data.bufferViews.length; index++) {
    const view = data.bufferViews[index]
    const bytes = replacements.get(index) ?? bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
    const padded = Buffer.alloc(Math.ceil(bytes.length / 4) * 4)
    bytes.copy(padded); parts.push(padded)
    view.byteOffset = offset; view.byteLength = bytes.length; view.buffer = 0
    offset += padded.length
  }
  data.buffers = [{ byteLength: offset }]
  const json = Buffer.from(JSON.stringify(data)), jsonChunk = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32)
  json.copy(jsonChunk)
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8)
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4)
  header.writeUInt32LE(28 + jsonChunk.length + offset, 8)
  header.writeUInt32LE(jsonChunk.length, 12); header.writeUInt32LE(0x4e4f534a, 16)
  binHeader.writeUInt32LE(offset); binHeader.writeUInt32LE(0x004e4942, 4)
  const result = Buffer.concat([header, jsonChunk, binHeader, ...parts])
  const hash = createHash('sha256').update(result).digest('hex').slice(0, 12)
  const name = `${id}-${hash}.glb`
  await fs.writeFile(path.join(output, name), result)
  await fs.writeFile(path.join(output, name + '.gz'), gzipSync(result, { level: 9 }))
  // A meaningful extra saving for the device; texture-heavy scenes gain <2%.
  if (id === 'device') await fs.writeFile(path.join(output, name + '.br'), brotliCompressSync(result, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 9 },
  }))
  urls[id] = `/delivery/${name}`
  report.push({ id, before: inputBytes, after: result.length })
}
await fs.writeFile(path.join(root, 'src/delivery-assets.json'), JSON.stringify(urls, null, 2) + '\n')
const htmlFile = path.join(root, 'index.html')
let html = await fs.readFile(htmlFile, 'utf8')
html = html.replace(/    <link rel="preload" href="\/delivery\/[^\"]+" as="fetch" crossorigin \/>\n?/g, '')
html = html.replace('    <title>', `    <link rel="preload" href="${urls.device}" as="fetch" crossorigin />\n    <title>`)
await fs.writeFile(htmlFile, html)
console.table(report)
