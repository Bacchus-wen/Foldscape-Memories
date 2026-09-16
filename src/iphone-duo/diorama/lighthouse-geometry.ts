import {
  Box3, BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry,
  ExtrudeGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedMesh, Matrix4,
  Mesh, MeshStandardMaterial, Object3D, PointLight, Shape, ShapeGeometry, TorusGeometry, Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createCoastalMaterials } from './coastal-materials.ts'

type Point = [number, number]
type Position = [number, number, number]

/** XY is the page, +Z is height. Architecture is based at local zero for the fold reveal. */
export function createLighthouseGeometry(): {
  left: Group
  right: Group
  terrain: Object3D[]
  cabins: Object3D[]
  lighthouse: Object3D[]
  update(timeSeconds?: number, motionEnabled?: boolean): void
  dispose(): void
} {
  const surfaces = createCoastalMaterials()
  const geometries = new Set<BufferGeometry>()
  const instances = new Set<InstancedMesh>()
  const grassFields: { mesh: InstancedMesh; matrices: Matrix4[]; phases: number[] }[] = []
  const own = <T extends BufferGeometry>(geometry: T): T => {
    geometries.add(geometry)
    return geometry
  }
  let seed = 5187
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const left = new Group(), right = new Group()
  left.name = 'lighthouse-left-page'
  right.name = 'lighthouse-right-page'
  const unitBox = own(new BoxGeometry(1, 1, 1))
  const unitCylinder = own(new CylinderGeometry(1, 1, 1, 8).rotateX(Math.PI / 2))
  const pyramid = own(new ConeGeometry(1, 1, 4).rotateY(Math.PI / 4).rotateX(Math.PI / 2))
  const gable = own(new ExtrudeGeometry(new Shape()
    .moveTo(-0.5, 0).lineTo(0.5, 0).lineTo(0, 1).closePath(),
  { depth: 1, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.5, 0))
  const archShape = new Shape().moveTo(-0.5, 0).lineTo(0.5, 0).lineTo(0.5, 0.79)
    .quadraticCurveTo(0.5, 1, 0, 1).quadraticCurveTo(-0.5, 1, -0.5, 0.79).closePath()
  const archedWindow = own(new ShapeGeometry(archShape, 5).rotateX(Math.PI / 2))
  const mesh = (parent: Object3D, geometry: BufferGeometry, surface: MeshStandardMaterial,
    position: Position, scale: Position) => {
    const value = new Mesh(geometry, surface)
    value.position.set(...position)
    value.scale.set(...scale)
    value.castShadow = surface !== surfaces.glass
    value.receiveShadow = true
    parent.add(value)
    return value
  }
  const box = (parent: Object3D, surface: MeshStandardMaterial,
    x: number, y: number, z: number, width: number, depth: number, height: number) =>
    mesh(parent, unitBox, surface, [x, y, z], [width, depth, height])
  const rod = (parent: Object3D, surface: MeshStandardMaterial, a: Position, b: Position, radius: number) => {
    const start = new Vector3(...a), end = new Vector3(...b)
    const direction = end.clone().sub(start)
    const value = mesh(parent, unitCylinder, surface, start.add(end).multiplyScalar(0.5).toArray() as Position,
      [radius, radius, direction.length()])
    value.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), direction.normalize())
    return value
  }

  // Keep separate animation roots while batching their immutable architectural details by material.
  const batch = (parent: Group) => {
    const groups = new Map<MeshStandardMaterial, Mesh[]>()
    for (const child of parent.children) {
      if (!(child instanceof Mesh) || child instanceof InstancedMesh) continue
      const surface = child.material as MeshStandardMaterial
      const values = groups.get(surface) ?? []
      values.push(child)
      groups.set(surface, values)
    }
    for (const [surface, values] of groups) {
      const parts = values.map(value => {
        value.updateMatrix()
        const geometry = value.geometry.index ? value.geometry.toNonIndexed() : value.geometry.clone()
        return geometry.applyMatrix4(value.matrix)
      })
      const geometry = mergeGeometries(parts, false)
      parts.forEach(part => part.dispose())
      if (!geometry) throw new Error('Coastal geometry contains incompatible vertex attributes.')
      const combined = mesh(parent, own(geometry), surface, [0, 0, 0], [1, 1, 1])
      combined.name = surface.name
      values.forEach(value => parent.remove(value))
    }
  }

  const rockVariants = Array.from({ length: 5 }, (_, variant) => {
    const geometry = own(new IcosahedronGeometry(1, variant === 4 ? 0 : 2))
    const position = geometry.attributes.position
    const colors: number[] = []
    for (let index = 0; index < position.count; index++) {
      const x = position.getX(index), y = position.getY(index), z = position.getZ(index)
      const warp = 0.89 + Math.sin(x * 8.3 + y * 5.7 + z * 4.1 + variant * 2.3) * 0.105
        + Math.sin(x * 15.1 - y * 11.3 + z * 7.1) * 0.042
      position.setXYZ(index, x * warp, y * warp, z * warp * 0.87)
      const shade = 0.79 + (z + 1) * 0.06 + Math.sin(x * 6.1 + y * 9.2) * 0.065
      colors.push(shade * 1.035, shade, shade * 0.945)
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    return geometry
  })
  const centerline = (x: number, isLeft: boolean) => isLeft
    ? 0.173 + Math.sin((x + 0.475) * 6.6) * 0.013
    : 0.181 + Math.sin((x + 0.475) * 3.4) * 0.026
  const shoreWidth = (x: number, isLeft: boolean) => {
    const center = isLeft ? -0.12 : 0.065
    const spread = isLeft ? 0.27 : 0.25
    return 0.039 + (isLeft ? 0.047 : 0.104) * Math.exp(-Math.pow((x - center) / spread, 4))
  }
  const createGround = (parent: Group, isLeft: boolean) => {
    const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = []
    const columns = 52, rows = 10, start = -0.477, end = isLeft ? 0.477 : 0.399
    for (let column = 0; column <= columns; column++) {
      const x = start + (end - start) * column / columns
      const width = shoreWidth(x, isLeft) * (1 + Math.sin(column * 2.1) * 0.08)
      for (let row = 0; row <= rows; row++) {
        const t = row / rows * 2 - 1
        const z = 0.008 + (1 - Math.abs(t) ** 1.7) * 0.025
          + Math.sin(column * 3.7 + row * 2.4) * 0.0019
        positions.push(x, centerline(x, isLeft) + t * width, z)
        uvs.push(x * 13, t * 2.5)
        const shade = 0.82 + random() * 0.15
        colors.push(shade, shade * 0.96, shade * 0.86)
        if (column < columns && row < rows) {
          const a = column * (rows + 1) + row, b = a + rows + 1
          indices.push(a, b, a + 1, b, b + 1, a + 1)
        }
      }
    }
    const geometry = own(new BufferGeometry())
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    const ground = mesh(parent, geometry, surfaces.stone, [0, 0, 0], [1, 1, 1])
    ground.name = 'low-gravel-causeway'
  }
  const createRocks = (parent: Group, isLeft: boolean) => {
    const transform = new Object3D()
    const bounds = new Box3()
    const palette = ['#b9b3a5', '#8e9390', '#c7bbab', '#a09b91', '#797e79', '#d0c4b1', '#969287']
      .map(color => new Color(color))
    for (let variant = 0; variant < rockVariants.length; variant++) {
      const pebble = variant === 4
      const count = pebble ? 145 : (isLeft ? 43 : 53)
      const geometry = rockVariants[variant]
      const field = new InstancedMesh(geometry, surfaces.stone, count)
      instances.add(field)
      field.name = pebble ? 'shore-pebbles' : 'irregular-coastal-boulders'
      for (let index = 0; index < count; index++) {
        const radius = pebble ? 0.004 + random() * 0.009 : 0.018 + random() ** 1.7 * 0.029
        const x = -0.46 + radius + random() * ((isLeft ? 0.92 : 0.84) - radius * 2)
        const t = pebble ? (random() - 0.5) * 1.9
          : (random() > 0.5 ? 1 : -1) * (0.62 + random() * 0.42)
        const y = centerline(x, isLeft) + t * shoreWidth(x, isLeft)
        transform.position.set(x, y, 0)
        transform.scale.set(radius * (0.8 + random() * 0.45), radius * (0.7 + random() * 0.55),
          radius * (0.56 + random() * 0.55))
        transform.rotation.set(random() * 0.5, random() * 0.5, random() * Math.PI * 2)
        transform.updateMatrix()
        bounds.copy(geometry.boundingBox!).applyMatrix4(transform.matrix)
        transform.position.z = 0.004 + Math.max(0, 1 - Math.abs(t)) * 0.026 - bounds.min.z
        transform.updateMatrix()
        field.setMatrixAt(index, transform.matrix)
        field.setColorAt(index, palette[Math.floor(random() * palette.length)])
      }
      field.castShadow = field.receiveShadow = true
      parent.add(field)
    }
  }
  const grassGeometry = (() => {
    const positions: number[] = [], colors: number[] = [], uvs: number[] = []
    for (let blade = 0; blade < 9; blade++) {
      const angle = blade * 2.4
      const x = Math.cos(angle), y = Math.sin(angle), height = 0.6 + random() * 0.4
      positions.push(-y * 0.08, x * 0.08, 0, y * 0.08, -x * 0.08, 0, x * 0.42, y * 0.42, height)
      colors.push(0.62, 0.64, 0.51, 0.62, 0.64, 0.51, 1, 0.96, 0.75)
      uvs.push(0, 0, 1, 0, 0.5, 1)
    }
    const geometry = own(new BufferGeometry())
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
    geometry.computeVertexNormals()
    return geometry
  })()
  const createGrass = (parent: Group, isLeft: boolean) => {
    const grass = new InstancedMesh(grassGeometry, surfaces.plants, isLeft ? 15 : 12)
    grass.name = 'sparse-salt-grass'
    instances.add(grass)
    const transform = new Object3D()
    const matrices: Matrix4[] = [], phases: number[] = []
    for (let index = 0; index < grass.count; index++) {
      const x = isLeft ? -0.35 + random() * 0.48 : -0.27 + random() * 0.57
      const side = index % 2 ? 1 : -1
      transform.position.set(x, centerline(x, isLeft) + side * shoreWidth(x, isLeft) * 0.79, 0.028)
      transform.scale.setScalar(0.019 + random() * 0.018)
      transform.rotation.z = random() * Math.PI * 2
      transform.updateMatrix()
      grass.setMatrixAt(index, transform.matrix)
      matrices.push(transform.matrix.clone())
      phases.push(random() * Math.PI * 2)
    }
    grassFields.push({ mesh: grass, matrices, phases })
    grass.castShadow = grass.receiveShadow = true
    parent.add(grass)
  }
  const createTerrain = (root: Group, isLeft: boolean) => {
    const shore = new Group()
    shore.name = isLeft ? 'left-rock-causeway' : 'right-rock-causeway'
    root.add(shore)
    createGround(shore, isLeft)
    createRocks(shore, isLeft)
    createGrass(shore, isLeft)
    return shore
  }
  const terrain = [createTerrain(left, true), createTerrain(right, false)]

  const roof = (parent: Group, x: number, y: number, z: number,
    width: number, depth: number, rise: number) => {
    mesh(parent, gable, surfaces.plaster, [x, y, z], [width, depth, rise])
    const half = width / 2 + 0.005
    const angle = Math.atan2(rise, width / 2)
    const length = half / Math.cos(angle)
    for (const side of [-1, 1]) {
      const panel = box(parent, surfaces.roof, x + side * half / 2, y, z + rise / 2 - 0.002,
        length, depth + 0.013, 0.003)
      panel.rotation.y = side * angle
      for (let seam = -4; seam <= 4; seam++) {
        const fold = box(parent, surfaces.roof, x + side * half / 2, y + seam * depth / 9,
          z + rise / 2, length, 0.0012, 0.0018)
        fold.rotation.y = side * angle
      }
      rod(parent, surfaces.metal, [x + side * half, y - depth / 2, z - 0.003],
        [x + side * half, y + depth / 2, z - 0.003], 0.002)
    }
    rod(parent, surfaces.roof, [x, y - depth / 2 - 0.006, z + rise],
      [x, y + depth / 2 + 0.006, z + rise], 0.0028)
  }
  const window = (parent: Group, x: number, y: number, bottom: number,
    width: number, height: number, arched = false) => {
    if (arched) {
      mesh(parent, archedWindow, surfaces.dark, [x, y - 0.001, bottom], [width, 1, height])
    } else {
      box(parent, surfaces.dark, x, y - 0.001, bottom + height / 2, width, 0.002, height)
    }
    for (const edge of [-1, 1]) {
      box(parent, surfaces.metal, x + edge * (width / 2 + 0.001), y - 0.002, bottom + height / 2,
        0.002, 0.003, height + 0.003)
    }
    box(parent, surfaces.metal, x, y - 0.003, bottom - 0.001, width + 0.009, 0.009, 0.003)
    box(parent, surfaces.metal, x, y - 0.002, bottom + height, width + 0.008, 0.004, 0.003)
    box(parent, surfaces.metal, x, y - 0.003, bottom + height * 0.54, width, 0.002, 0.0013)
  }
  const cabin = (x: number, y: number, width: number, depth: number, angle: number) => {
    const hut = new Group()
    hut.name = 'small-red-guardhouse'
    hut.position.set(x, y, 0.032)
    hut.rotation.z = angle
    left.add(hut)
    box(hut, surfaces.masonry, 0, 0, 0.008, width + 0.005, depth + 0.005, 0.016)
    box(hut, surfaces.timber, 0, 0, 0.056, width, depth, 0.091)
    for (let board = -3; board <= 3; board++) {
      box(hut, surfaces.red, board * width / 8, -depth / 2 - 0.001, 0.057, 0.0009, 0.001, 0.087)
    }
    box(hut, surfaces.dark, 0.005, -depth / 2 - 0.0015, 0.05, width * 0.43, 0.0015, 0.077)
    for (const side of [-1, 1]) {
      box(hut, surfaces.metal, 0.005 + side * width * 0.228, -depth / 2 - 0.0025, 0.05,
        0.0016, 0.002, 0.079)
    }
    box(hut, surfaces.metal, 0.005, -depth / 2 - 0.002, 0.09, width * 0.5, 0.003, 0.002)
    box(hut, surfaces.masonry, 0.005, -depth / 2 - 0.01, 0.005, width * 0.57, 0.021, 0.01)
    const roofHeight = width * 0.39
    mesh(hut, pyramid, surfaces.roof, [0, 0, 0.103 + roofHeight / 2],
      [(width + 0.014) / Math.SQRT2, (depth + 0.014) / Math.SQRT2, roofHeight])
    box(hut, surfaces.roof, 0, 0, 0.102, width + 0.014, depth + 0.014, 0.0024)
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) rod(hut, surfaces.roof,
        [sx * (width + 0.014) / 2, sy * (depth + 0.014) / 2, 0.104],
        [0, 0, 0.103 + roofHeight], 0.0008)
    }
    batch(hut)
    return hut
  }
  const cabins = [cabin(-0.205, 0.153, 0.07, 0.078, 0.04), cabin(0.02, 0.204, 0.08, 0.084, -0.06)]

  const tower = new Group()
  tower.name = 'main-lighthouse-architecture'
  tower.position.set(0.06, 0.22, 0.032)
  right.add(tower)
  // The photograph's attached gables reach most of the red tower's height.
  const wings = [[-0.145, 0.016, 0.126, 0.181, 0.35, 0.109], [0.15, -0.002, 0.136, 0.221, 0.351, 0.103]]
  for (const [x, y, width, depth, height, rise] of wings) {
    box(tower, surfaces.masonry, x, y, 0.012, width + 0.011, depth + 0.011, 0.024)
    box(tower, surfaces.red, x, y, 0.081, width, depth, 0.142)
    box(tower, surfaces.plaster, x, y, (0.152 + height) / 2, width, depth, height - 0.152)
    roof(tower, x, y, height, width, depth, rise)
    const face = y - depth / 2 - 0.001
    window(tower, x, face, 0.202, width * 0.43, 0.053)
    window(tower, x, face, 0.301, width * 0.39, 0.052)
    box(tower, surfaces.metal, x, face - 0.003, 0.229, 0.0023, 0.002, 0.054)
    box(tower, surfaces.metal, x, face - 0.003, 0.327, 0.0023, 0.002, 0.053)
    window(tower, x, face, height + rise * 0.52, 0.012, 0.022, true)
    window(tower, x, y + depth / 2 + 0.003, 0.208, 0.029, 0.049)
    const pipeX = x + Math.sign(x) * (width / 2 + 0.003)
    rod(tower, surfaces.metal, [pipeX, face + 0.003, 0.026], [pipeX, face + 0.003, height], 0.0017)
    for (const z of [0.09, 0.23, 0.32]) {
      box(tower, surfaces.metal, pipeX, face + 0.003, z, 0.007, 0.005, 0.0016)
    }
  }
  box(tower, surfaces.masonry, 0, 0, 0.012, 0.176, 0.193, 0.024)
  box(tower, surfaces.red, 0, 0, 0.28, 0.165, 0.181, 0.54)
  for (const z of [0.225, 0.355, 0.46]) window(tower, 0.014, -0.093, z, 0.021, 0.064, true)
  for (const z of [0.216, 0.358, 0.465]) {
    const detail = new Group()
    detail.position.set(-0.084, -0.021, z)
    detail.rotation.z = -Math.PI / 2
    window(detail, 0, 0, 0, 0.013, 0.058, true)
    detail.updateMatrix()
    for (const child of [...detail.children]) {
      child.updateMatrix()
      child.applyMatrix4(detail.matrix)
      tower.add(child)
    }
  }
  window(tower, -0.035, -0.093, 0.04, 0.022, 0.068)
  // The larger dark entrance belongs to the right wing, as in the reference.
  box(tower, surfaces.dark, 0.15, -0.115, 0.067, 0.069, 0.004, 0.112)
  for (const x of [0.113, 0.187]) box(tower, surfaces.metal, x, -0.117, 0.069, 0.004, 0.006, 0.119)
  box(tower, surfaces.metal, 0.15, -0.118, 0.129, 0.081, 0.007, 0.008)
  box(tower, surfaces.metal, 0.15, -0.118, 0.067, 0.003, 0.003, 0.112)
  for (let step = 0; step < 3; step++) {
    box(tower, surfaces.masonry, 0.15, -0.163 + step * 0.012, 0.003 + step * 0.005,
      0.095, 0.035, 0.006 + step * 0.01)
  }

  // Small plaster losses and masonry courses break perfect, toy-like surfaces.
  for (let index = 0; index < 11; index++) {
    const patch = new Shape()
    for (let corner = 0; corner < 7; corner++) {
      const angle = corner / 7 * Math.PI * 2
      const radius = 0.65 + random() * 0.35
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius
      if (corner === 0) patch.moveTo(x, y)
      else patch.lineTo(x, y)
    }
    patch.closePath()
    const geometry = own(new ShapeGeometry(patch).rotateX(Math.PI / 2))
    mesh(tower, geometry, surfaces.worn,
      [0.1 + random() * 0.106, -0.1142, 0.16 + random() * 0.04],
      [0.003 + random() * 0.01, 1, 0.002 + random() * 0.007])
  }
  for (let row = 0; row < 2; row++) {
    for (let block = 0; block < 14; block++) {
      const x = -0.22 + block * 0.032 + (row % 2) * 0.014
      box(tower, surfaces.masonry, x, -0.135, 0.004 + row * 0.007,
        0.026 + random() * 0.004, 0.021, 0.006)
    }
  }
  const railing = (a: Point, b: Point, posts: number) => {
    for (let index = 0; index <= posts; index++) {
      const x = a[0] + (b[0] - a[0]) * index / posts
      const y = a[1] + (b[1] - a[1]) * index / posts
      rod(tower, surfaces.metal, [x, y, 0.016], [x, y, 0.06], 0.00135)
    }
    for (const z of [0.037, 0.058]) rod(tower, surfaces.metal, [a[0], a[1], z], [b[0], b[1], z], 0.0011)
  }
  railing([-0.234, -0.149], [0.098, -0.149], 8)
  railing([0.208, -0.149], [0.233, -0.149], 1)
  railing([-0.234, -0.149], [-0.234, 0.125], 6)
  railing([0.233, -0.149], [0.233, 0.125], 6)
  railing([-0.234, 0.125], [0.233, 0.125], 10)

  box(tower, surfaces.metal, 0, 0, 0.553, 0.196, 0.213, 0.008)
  box(tower, surfaces.masonry, 0, 0, 0.545, 0.177, 0.194, 0.009)
  box(tower, surfaces.metal, 0, 0, 0.568, 0.129, 0.141, 0.023)
  const lanternBase = 0.58, lanternTop = 0.664
  for (const side of [-1, 1]) {
    box(tower, surfaces.glass, 0, side * 0.069, 0.622, 0.124, 0.001, 0.082)
    box(tower, surfaces.glass, side * 0.062, 0, 0.622, 0.001, 0.138, 0.082)
    for (const x of [-0.063, 0, 0.063]) {
      rod(tower, surfaces.metal, [x, side * 0.07, lanternBase], [x, side * 0.07, lanternTop], 0.0016)
    }
    rod(tower, surfaces.metal, [side * 0.063, 0, lanternBase], [side * 0.063, 0, lanternTop], 0.0015)
  }
  box(tower, surfaces.metal, 0, 0, 0.666, 0.139, 0.155, 0.005)
  mesh(tower, unitCylinder, surfaces.lens, [0, 0, 0.622], [0.015, 0.015, 0.06])
  const lantern = new PointLight('#ffc978', 0.026, 0.24, 2)
  lantern.name = 'warm-lantern-light'
  lantern.position.set(0, -0.015, 0.622)
  tower.add(lantern)
  const lensRing = own(new TorusGeometry(0.016, 0.0013, 5, 18))
  for (let ring = 0; ring < 8; ring++) mesh(tower, lensRing, surfaces.lens,
    [0, 0, 0.596 + ring * 0.0075], [1, 1, 1])
  rod(tower, surfaces.metal, [0, 0, 0.557], [0, 0, 0.59], 0.004)
  mesh(tower, pyramid, surfaces.roof, [0, 0, 0.699], [0.128, 0.14, 0.061])
  box(tower, surfaces.roof, 0, 0, 0.669, 0.183, 0.199, 0.003)
  rod(tower, surfaces.metal, [0, 0, 0.728], [0, 0, 0.75], 0.0021)
  mesh(tower, own(new IcosahedronGeometry(1, 1)), surfaces.metal, [0, 0, 0.738], [0.0045, 0.0045, 0.005])
  for (const x of [-0.095, 0.095]) {
    for (const y of [-0.103, 0, 0.103]) rod(tower, surfaces.metal, [x, y, 0.557], [x, y, 0.6], 0.00115)
    for (const z of [0.579, 0.599]) rod(tower, surfaces.metal, [x, -0.103, z], [x, 0.103, z], 0.001)
  }
  for (const y of [-0.103, 0.103]) {
    for (const z of [0.579, 0.599]) rod(tower, surfaces.metal, [-0.095, y, z], [0.095, y, z], 0.001)
  }
  rod(tower, surfaces.metal, [0.103, 0.071, 0.557], [0.103, 0.071, 0.804], 0.0009)
  rod(tower, surfaces.metal, [0.09, 0.066, 0.576], [0.103, 0.071, 0.62], 0.00055)
  batch(tower)

  let disposed = false
  return {
    left, right, terrain, cabins, lighthouse: [tower],
    update(timeSeconds = 0, motionEnabled = false) {
      const rotation = new Matrix4(), sway = new Matrix4()
      for (const { mesh: grass, matrices, phases } of grassFields) {
        for (let index = 0; index < grass.count; index++) {
          if (!motionEnabled) {
            grass.setMatrixAt(index, matrices[index])
            continue
          }
          const angle = Math.sin(timeSeconds * 1.15 + phases[index]) * 0.055
            + Math.sin(timeSeconds * 0.47 + phases[index] * 1.7) * 0.018
          rotation.makeRotationX(angle)
          sway.multiplyMatrices(matrices[index], rotation)
          grass.setMatrixAt(index, sway)
        }
        grass.instanceMatrix.needsUpdate = true
      }
      lantern.intensity = motionEnabled
        ? 0.026 + Math.sin(timeSeconds * 1.7) * 0.003 + Math.sin(timeSeconds * 3.1 + 0.8) * 0.001
        : 0.026
    },
    dispose() {
      if (disposed) return
      disposed = true
      left.removeFromParent()
      right.removeFromParent()
      instances.forEach(value => value.dispose())
      geometries.forEach(value => value.dispose())
      surfaces.dispose()
    },
  }
}

