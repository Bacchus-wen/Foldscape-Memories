// No quantization, filtering, vertex reordering or triangle rotation: compare
// the decoder's bytes against the original before accepting each buffer view.
export function encodePhoneView(data, index, bytes, encoder, decoder) {
  const view = data.bufferViews[index], accessors = data.accessors.filter(a => a.bufferView === index)
  if (!accessors.length || (accessors.length > 1 && !view.byteStride)) return null
  const sizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
  const components = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
  const first = accessors[0]
  const stride = view.byteStride || sizes[first.type] * components[first.componentType]
  const mode = accessors.length === 1 && first.type === 'SCALAR' && [5123, 5125].includes(first.componentType) ? 'INDICES' : 'ATTRIBUTES'
  if (!stride || bytes.length % stride || (mode === 'ATTRIBUTES' && (stride % 4 || stride > 256))) return null
  const count = bytes.length / stride
  const encoded = encoder.encodeGltfBuffer(bytes, count, stride, mode)
  if (encoded.length >= bytes.length) return null
  const decoded = Buffer.alloc(bytes.length)
  decoder.decodeGltfBuffer(decoded, count, stride, encoded, mode, 'NONE')
  if (!decoded.equals(bytes)) throw new Error(`Non-identical geometry buffer: ${index}`)
  return { bytes: Buffer.from(encoded), count, byteStride: stride, mode, filter: 'NONE' }
}
