import { Group, Matrix4, Vector3, type Object3D, type SkinnedMesh } from 'three'

export function createPageAnchors(screen: SkinnedMesh, host: Object3D, flatScene = false) {
  const uv = screen.geometry.attributes.uv
  const inverseHost = new Matrix4()
  const world = new Matrix4()
  const flatOffset = new Matrix4().makeTranslation(-1 / .94, 0, 0)
  let flatBasis: Matrix4 | undefined
  const points = [new Vector3(), new Vector3(), new Vector3()]
  const delta1 = new Vector3(), delta2 = new Vector3()
  const uAxis = new Vector3(), vAxis = new Vector3()
  const x = new Vector3(), y = new Vector3(), normal = new Vector3(), center = new Vector3()
  const sides = [0.25, 0.75].map(uCenter => {
    // Interior samples exclude the bend and rounded corners of this actual rig.
    const samples = [[uCenter-.1,.15],[uCenter+.13,.15],[uCenter-.1,.85]].map(([u,v]) => {
      let index = 0, distance = Infinity
      for (let i=0;i<uv.count;i++) {
        const candidate = (uv.getX(i)-u)**2 + (uv.getY(i)-v)**2
        if (candidate < distance) { distance = candidate; index = i }
      }
      return { index, u: uv.getX(index), v: uv.getY(index) }
    })
    const group = new Group()
    group.name = uCenter < .5 ? 'DioramaPageLeft' : 'DioramaPageRight'
    group.matrixAutoUpdate = false
    host.add(group)
    return { group, samples, uCenter }
  })
  const update = () => {
    screen.skeleton.update()
    inverseHost.copy(host.matrixWorld).invert()
    for (const { group, samples, uCenter } of sides) {
      samples.forEach((sample,i) => screen.getVertexPosition(sample.index, points[i]).applyMatrix4(screen.matrixWorld))
      const [a,b,c] = samples
      const du1=b.u-a.u, dv1=b.v-a.v, du2=c.u-a.u, dv2=c.v-a.v
      const determinant=du1*dv2-du2*dv1
      delta1.subVectors(points[1],points[0]); delta2.subVectors(points[2],points[0])
      uAxis.copy(delta1).multiplyScalar(dv2).addScaledVector(delta2,-dv1).divideScalar(determinant)
      vAxis.copy(delta2).multiplyScalar(du1).addScaledVector(delta1,-du2).divideScalar(determinant)
      x.copy(uAxis).normalize(); y.copy(vAxis).negate().normalize()
      normal.crossVectors(x,y).normalize()
      center.copy(points[0]).addScaledVector(uAxis,uCenter-a.u).addScaledVector(vAxis,.5-a.v).addScaledVector(normal,.02)
      const width=uAxis.length()*.5*.94
      world.makeBasis(x.multiplyScalar(width),y.multiplyScalar(width),normal.multiplyScalar(width)).setPosition(center)
      group.matrix.multiplyMatrices(inverseHost,world)
      group.updateMatrixWorld(true)
    }
  }
  const updateAnchors = () => {
    update()
    if (flatScene) {
      // Keep the complete scene on the stationary right screen's plane.
      flatBasis ??= sides[1].group.matrix.clone()
      sides[1].group.matrix.copy(flatBasis)
      sides[1].group.updateMatrixWorld(true)
      sides[0].group.matrix.copy(flatBasis).multiply(flatOffset)
      sides[0].group.updateMatrixWorld(true)
    }
  }
  return { left: sides[0].group, right: sides[1].group, update: updateAnchors, dispose() { sides.forEach(({group})=>group.removeFromParent()) } }
}
