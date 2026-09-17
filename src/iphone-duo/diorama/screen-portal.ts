import { Mesh, Plane, Vector3, type Object3D, type Material } from 'three'
import { createPortalCaps } from './portal-caps.ts'

/** The fixed landscape occupies only the space released by the moving lid. */
export function createScreenPortal(pages: Object3D[], anchors: Object3D[], foldingScreen: Object3D, cutColor = '#b5aea1') {
  const screenPlane = new Plane()
  const materials: Material[] = []
  pages.forEach(page => {
    page.updateWorldMatrix(true, true)
    const copies = new Map<Material, Material>()
    page.traverse(object => {
      if (!(object instanceof Mesh)) return
      const copy = (source: Material) => {
        if (!copies.has(source)) {
          const material = source.clone()
          material.clippingPlanes = [screenPlane]
          material.clipShadows = true
          copies.set(source, material)
          materials.push(material)
        }
        return copies.get(source)!
      }
      object.material = Array.isArray(object.material) ? object.material.map(copy) : copy(object.material)
    })
  })
  const caps = foldingScreen.parent ? createPortalCaps(pages, foldingScreen.parent, [screenPlane], cutColor) : undefined
  const up = new Vector3(0, 0, 1), lidNormal = new Vector3(), baseNormal = new Vector3()
  return {
    update(_progress: number) {
      lidNormal.copy(up).transformDirection(foldingScreen.matrixWorld)
      baseNormal.copy(up).transformDirection(anchors[1].matrixWorld)
      const aperture = Math.max(0, Math.min(1, (lidNormal.dot(baseNormal) + 1) / 2))
      // Keep the section just above the water until the lid lies flat.
      // This offset, visibility and cap activation all follow the actual hinge.
      const flat = Math.max(0, Math.min(1, (aperture - .975) / .025))
      screenPlane.set(up, -.009 * (1 - flat * flat * (3 - 2 * flat))).applyMatrix4(foldingScreen.matrixWorld)
      pages.forEach(page => { page.visible = aperture > 1e-6 })
      caps?.update(aperture)
    },
    dispose() { caps?.dispose(); materials.forEach(material => material.dispose()) },
  }
}
