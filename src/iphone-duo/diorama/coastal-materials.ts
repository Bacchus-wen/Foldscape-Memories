import {
  DataTexture, DoubleSide, LinearMipmapLinearFilter, MeshPhysicalMaterial,
  MeshStandardMaterial, RepeatWrapping, RGBAFormat, SRGBColorSpace,
} from 'three'

/** Small, deterministic surface maps: pigment, mineral grain, and roughness, without image assets. */
export function createCoastalMaterials() {
  const textures: DataTexture[] = []
  const materials: MeshStandardMaterial[] = []
  const noise = (x: number, y: number, period: number, verticalPeriod = period) => {
    const hash = (a: number, b: number) => {
      const value = Math.sin(((a % period + period) % period) * 127.1
        + ((b % verticalPeriod + verticalPeriod) % verticalPeriod) * 311.7 + 43.3) * 43758.5453
      return value - Math.floor(value)
    }
    const ix = Math.floor(x), iy = Math.floor(y)
    const fx = x - ix, fy = y - iy
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
    const bottom = hash(ix, iy) * (1 - u) + hash(ix + 1, iy) * u
    const top = hash(ix, iy + 1) * (1 - u) + hash(ix + 1, iy + 1) * u
    return bottom * (1 - v) + top * v
  }
  const surface = (kind: 'plaster' | 'stone' | 'metal' | 'wood') => {
    const size = 128
    const color = new Uint8Array(size * size * 4)
    const bump = new Uint8Array(size * size * 4)
    const rough = new Uint8Array(size * size * 4)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size
        const broad = noise(u * 8, v * 8, 8)
        const middle = noise(u * 32, v * 32, 32)
        const grain = noise(u * 128, v * 128, 128)
        const streak = noise(u * 48, v * 4, 48, 4)
        const pits = Math.max(0, 0.27 - middle) * 2.5
        let pigment = 0.91 + broad * 0.065 + grain * 0.02
        let relief = 0.34 + middle * 0.2 + grain * 0.2 - pits * 0.3
        let roughness = 0.82 + grain * 0.15
        if (kind === 'stone') {
          pigment = 0.74 + broad * 0.14 + middle * 0.1 + grain * 0.06
          relief = 0.18 + broad * 0.25 + middle * 0.22 + grain * 0.3
        } else if (kind === 'metal') {
          pigment = 0.82 + streak * 0.12 + grain * 0.035
          relief = 0.4 + streak * 0.08 + grain * 0.09
          roughness = 0.58 + broad * 0.23
        } else if (kind === 'wood') {
          pigment = 0.8 + streak * 0.16 + broad * 0.04
          relief = 0.29 + streak * 0.31 + grain * 0.12
        }
        const offset = (y * size + x) * 4
        for (let channel = 0; channel < 3; channel++) {
          color[offset + channel] = Math.round(Math.min(1, pigment) * 255)
          bump[offset + channel] = Math.round(Math.max(0, Math.min(1, relief)) * 255)
          rough[offset + channel] = Math.round(roughness * 255)
        }
        color[offset + 3] = bump[offset + 3] = rough[offset + 3] = 255
      }
    }
    const texture = (data: Uint8Array, isColor = false) => {
      const value = new DataTexture(data, size, size, RGBAFormat)
      value.wrapS = value.wrapT = RepeatWrapping
      value.repeat.set(kind === 'stone' ? 2 : 3, kind === 'wood' ? 2 : 4)
      value.generateMipmaps = true
      value.minFilter = LinearMipmapLinearFilter
      if (isColor) value.colorSpace = SRGBColorSpace
      value.needsUpdate = true
      textures.push(value)
      return value
    }
    return { map: texture(color, true), bumpMap: texture(bump), roughnessMap: texture(rough) }
  }
  const plasterMaps = surface('plaster')
  const stoneMaps = surface('stone')
  const metalMaps = surface('metal')
  const woodMaps = surface('wood')
  const own = <T extends MeshStandardMaterial>(name: string, value: T): T => {
    value.name = name
    materials.push(value)
    return value
  }
  const red = own('weathered-red-render', new MeshStandardMaterial({
    color: '#ab3029', roughness: 0.94, ...plasterMaps, bumpScale: 0.0012,
  }))
  const plaster = own('aged-white-plaster', new MeshStandardMaterial({
    color: '#e1ded4', roughness: 0.94, ...plasterMaps, bumpScale: 0.0015,
  }))
  const stone = own('natural-coastal-stone', new MeshStandardMaterial({
    color: '#b8b1a3', vertexColors: true, roughness: 1, ...stoneMaps, bumpScale: 0.004,
  }))
  const masonry = own('masonry-and-mortar', new MeshStandardMaterial({
    color: '#8e887c', roughness: 0.96, ...stoneMaps, bumpScale: 0.0018,
  }))
  const worn = own('plaster-wear', new MeshStandardMaterial({
    color: '#b7afa0', roughness: 0.99, ...stoneMaps, bumpScale: 0.0008,
  }))
  const roof = own('seamed-weathered-roof', new MeshStandardMaterial({
    color: '#5c5c5b', metalness: 0.38, roughness: 0.76, ...metalMaps, bumpScale: 0.0007,
  }))
  const metal = own('dark-painted-metal', new MeshStandardMaterial({
    color: '#292e31', metalness: 0.6, roughness: 0.68, ...metalMaps, bumpScale: 0.00035,
  }))
  const timber = own('painted-hut-timber', new MeshStandardMaterial({
    color: '#a22d24', roughness: 0.94, ...woodMaps, bumpScale: 0.001,
  }))
  const dark = own('recessed-windows-and-doors', new MeshStandardMaterial({
    color: '#141e23', roughness: 0.67, metalness: 0.1,
  }))
  const glass = own('lantern-glazing', new MeshPhysicalMaterial({
    color: '#a0b6c7', metalness: 0.08, roughness: 0.17, transparent: true,
    opacity: 0.38, depthWrite: false, side: DoubleSide,
  }))
  const lens = own('fresnel-lens', new MeshStandardMaterial({
    color: '#c3baa0', metalness: 0.52, roughness: 0.25,
  }))
  const plants = own('sparse-coastal-grass', new MeshStandardMaterial({
    color: '#686849', vertexColors: true, roughness: 1, side: DoubleSide,
  }))
  let disposed = false
  return {
    red, plaster, stone, masonry, worn, roof, metal, timber, dark, glass, lens, plants,
    dispose() {
      if (disposed) return
      disposed = true
      materials.forEach(value => value.dispose())
      textures.forEach(value => value.dispose())
    },
  }
}
