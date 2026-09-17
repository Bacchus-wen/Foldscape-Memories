import { Float32BufferAttribute, Mesh, Triangle, Vector3, type Object3D } from 'three'

/** The authored logo is an insert in a hole, not a decal on a complete panel. */
export function fillRearPanelOpenings(root: Object3D) {
  const insert = root.getObjectByName('LDcHeENovRXWVxD')
  if (!(insert instanceof Mesh)) return
  insert.visible = false
  const base = root.getObjectByName('ZEAwVPmUDdMbViq')
  if (base) base.visible = false
  for (const name of ['CinrmKreKeCYatm', 'RfBGHMFerLjISPN']) {
    const panel = root.getObjectByName(name)
    if (!(panel instanceof Mesh)) continue
    const position = panel.geometry.attributes.position, normal = panel.geometry.attributes.normal
    const samples: { index: number; point: Vector3 }[] = []
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), z = position.getZ(i)
      if (normal.getY(i) < -.99 && x > 2.5 && x < 5.7 && Math.abs(z) < 1.7) samples.push({ index: i, point: new Vector3(x, 0, z) })
    }
    const a = samples.reduce((a, b) => a.point.x < b.point.x ? a : b)
    const b = samples.reduce((b, p) => p.point.distanceToSquared(a.point) > b.point.distanceToSquared(a.point) ? p : b)
    const area = (p: Vector3) => Math.abs((b.point.x-a.point.x)*(p.z-a.point.z)-(b.point.z-a.point.z)*(p.x-a.point.x))
    const c = samples.reduce((c, p) => area(p.point) > area(c.point) ? p : c)
    const fill = insert.clone(false)
    fill.name = `rear-panel-fill-${name}`
    fill.visible = true
    fill.geometry = insert.geometry.clone()
    fill.material = panel.material
    const vertices = fill.geometry.attributes.position, point = new Vector3(), weights = new Vector3()
    // Continue the panel's UV field across the hole; the logo's atlas UVs would
    // retain a different finish even if its material were replaced.
    for (const channel of ['uv', 'uv1', 'normal']) {
      const attribute = panel.geometry.attributes[channel], size = attribute.itemSize, values: number[] = []
      for (let i = 0; i < vertices.count; i++) {
        point.set(vertices.getX(i), 0, vertices.getZ(i))
        Triangle.getBarycoord(point, a.point, b.point, c.point, weights)
        for (let j = 0; j < size; j++) values.push(attribute.getComponent(a.index,j)*weights.x+attribute.getComponent(b.index,j)*weights.y+attribute.getComponent(c.index,j)*weights.z)
      }
      fill.geometry.setAttribute(channel, new Float32BufferAttribute(values, size))
    }
    fill.geometry.normalizeNormals()
    insert.parent!.add(fill)
  }
}
