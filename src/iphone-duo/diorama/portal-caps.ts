import { Box3, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, BufferGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, ShapeUtils, Vector2, Vector3, type Object3D, type Plane } from 'three'

// Slice the actual triangles: unlike stencil winding, this also handles assets
// with open bottoms. Work is limited to spatial blocks crossing the cut plane.
export function createPortalCaps(pages: Object3D[], host: Object3D, planes: Plane[], color: string) {
  const root = new Group()
  root.name = 'screen-portal-caps'
  host.add(root)
  host.updateWorldMatrix(true, true)
  const inverse = host.matrixWorld.clone().invert(), transform = new Matrix4(), instance = new Matrix4()
  const positions: number[] = [], point = new Vector3()
  for (const page of pages) page.traverse(object => {
    if (!(object instanceof Mesh)) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    if (materials.every(material => material.transparent)) return
    const geometry = object.geometry, attribute = geometry.attributes.position
    const count = geometry.index?.count ?? attribute.count
    for (let copy = 0; copy < (object instanceof InstancedMesh ? object.count : 1); copy++) {
      transform.multiplyMatrices(inverse, object.matrixWorld)
      if (object instanceof InstancedMesh) { object.getMatrixAt(copy, instance); transform.multiply(instance) }
      for (let i = 0; i < count; i++) {
        point.fromBufferAttribute(attribute, geometry.index ? geometry.index.getX(i) : i).applyMatrix4(transform)
        positions.push(point.x, point.y, point.z)
      }
    }
  })
  const vertices = new Float32Array(positions)
  const blocks: { start: number; end: number; center: Vector3; half: Vector3 }[] = []
  for (let start = 0; start < vertices.length; start += 9 * 128) {
    const end = Math.min(vertices.length, start + 9 * 128), box = new Box3()
    for (let i = start; i < end; i += 3) box.expandByPoint(point.fromArray(vertices, i))
    blocks.push({ start, end, center: box.getCenter(new Vector3()), half: box.getSize(new Vector3()).multiplyScalar(.5) })
  }
  const faces = planes.map((plane, index) => {
    const material = new MeshStandardMaterial({ color, roughness: .95, side: DoubleSide, clippingPlanes: planes.filter(other => other !== plane) })
    const face = new Mesh(new BufferGeometry(), material)
    face.name = 'portal-cut-face'
    face.renderOrder = 2
    face.frustumCulled = false
    root.add(face)
    return { face, previous: plane.clone(), initialized: false }
  })
  const local = planes.map(plane => plane.clone())
  const axis = new Vector3(), u = new Vector3(), v = new Vector3()
  const contains = (ring: Vector2[], p: Vector2) => {
    let inside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j]
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside
    }
    return inside
  }
  const slice = (plane: Plane, geometry: BufferGeometry) => {
    const n = plane.normal
    axis.set(0, Math.abs(n.z) < .9 ? 0 : 1, Math.abs(n.z) < .9 ? 1 : 0)
    u.crossVectors(axis, n).normalize(); v.crossVectors(n, u)
    const points: Vector3[] = [], edges: number[][] = [], links: number[][] = [], keys = new Map<string, number>(), edgeKeys = new Set<string>()
    const addPoint = (p: Vector3) => {
      const key = `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)},${Math.round(p.z * 1e5)}`
      let id = keys.get(key)
      if (id === undefined) { id = points.length; keys.set(key, id); points.push(p); links.push([]) }
      return id
    }
    const triangle = [new Vector3(), new Vector3(), new Vector3()], distances = [0, 0, 0]
    for (const block of blocks) {
      const radius = Math.abs(n.x) * block.half.x + Math.abs(n.y) * block.half.y + Math.abs(n.z) * block.half.z
      if (Math.abs(plane.distanceToPoint(block.center)) > radius + 1e-7) continue
      for (let i = block.start; i < block.end; i += 9) {
        for (let j = 0; j < 3; j++) distances[j] = plane.distanceToPoint(triangle[j].fromArray(vertices, i + j * 3))
        if (distances.every(d => d >= 0) || distances.every(d => d <= 0)) continue
        const hit: Vector3[] = []
        for (let j = 0; j < 3; j++) {
          const k = (j + 1) % 3
          if ((distances[j] < 0) !== (distances[k] < 0)) hit.push(triangle[j].clone().lerp(triangle[k], distances[j] / (distances[j] - distances[k])))
        }
        if (hit.length !== 2) continue
        const a = addPoint(hit[0]), b = addPoint(hit[1]), key = a < b ? `${a}:${b}` : `${b}:${a}`
        if (a === b || edgeKeys.has(key)) continue
        edgeKeys.add(key); links[a].push(edges.length); links[b].push(edges.length); edges.push([a, b])
      }
    }
    const used = new Set<number>(), rings: { ids: number[]; contour: Vector2[]; area: number; parent: number; depth: number }[] = []
    for (let first = 0; first < edges.length; first++) {
      if (used.has(first)) continue
      const ids = [edges[first][0]]
      let edge = first, current = ids[0]
      while (!used.has(edge)) {
        used.add(edge)
        current = edges[edge][0] === current ? edges[edge][1] : edges[edge][0]
        if (current === ids[0]) break
        ids.push(current)
        const next = links[current].find(candidate => !used.has(candidate))
        if (next === undefined) break
        edge = next
      }
      if (ids.length < 3) continue
      const contour = ids.map(id => new Vector2(points[id].dot(u), points[id].dot(v)))
      const area = Math.abs(ShapeUtils.area(contour))
      if (area > 1e-8) rings.push({ ids, contour, area, parent: -1, depth: 0 })
    }
    rings.sort((a, b) => b.area - a.area)
    rings.forEach((ring, index) => {
      for (let j = index - 1; j >= 0; j--) if (contains(rings[j].contour, ring.contour[0])) {
        ring.parent = j; ring.depth = rings[j].depth + 1; break
      }
    })
    const output: number[] = []
    rings.forEach((ring, index) => {
      if (ring.depth % 2) return
      const holes = rings.filter(other => other.parent === index && other.depth === ring.depth + 1)
      const ids = [...ring.ids, ...holes.flatMap(hole => hole.ids)]
      for (const face of ShapeUtils.triangulateShape(ring.contour, holes.map(hole => hole.contour))) for (const corner of face) {
        const p = points[ids[corner]]; output.push(p.x, p.y, p.z)
      }
    })
    let attribute = geometry.getAttribute('position') as Float32BufferAttribute | undefined
    if (!attribute || attribute.array.length < output.length) {
      // Release old GPU buffers on growth; ordinary frames reuse the allocation.
      geometry.dispose()
      attribute = new Float32BufferAttribute(new Float32Array(Math.max(9, Math.ceil(output.length / 9 * 1.5) * 9)), 3).setUsage(DynamicDrawUsage)
      geometry.setAttribute('position', attribute)
      geometry.deleteAttribute('normal')
    }
    attribute.array.set(output)
    attribute.needsUpdate = true
    geometry.setDrawRange(0, output.length / 3)
    geometry.computeVertexNormals()
  }
  root.visible = false
  return {
    update(progress: number) {
      root.visible = progress > .014 && progress < .999
      if (!root.visible) return
      inverse.copy(host.matrixWorld).invert()
      faces.forEach((entry, index) => {
        const plane = local[index].copy(planes[index]).applyMatrix4(inverse)
        if (entry.initialized && plane.normal.distanceToSquared(entry.previous.normal) < 1e-16 && Math.abs(plane.constant - entry.previous.constant) < 1e-8) return
        slice(plane, entry.face.geometry)
        entry.previous.copy(plane); entry.initialized = true
      })
    },
    dispose() { root.removeFromParent(); faces.forEach(({ face }) => { face.geometry.dispose(); face.material.dispose() }) },
  }
}
