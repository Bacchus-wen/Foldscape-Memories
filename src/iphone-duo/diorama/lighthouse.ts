import { Color, type Object3D, type SkinnedMesh } from 'three'
import { createPageAnchors } from './page-anchors'
import { createLighthouseGeometry } from './lighthouse-geometry'
import { getPopUpState, getRigidSceneRise } from './pop-up-motion'
import { createCoastalWater } from './coastal-water'
import { loadLighthouseAsset } from './lighthouse-asset'

export function createLighthouse(screen: SkinnedMesh, host: Object3D, onAssetState?: (state: 'ready' | 'fallback') => void) {
  const anchors = createPageAnchors(screen, host)
  const water = createCoastalWater(anchors.left, anchors.right, typeof window !== 'undefined' && window.innerWidth < 700 ? 512 : 1024)
  type Geometry = ReturnType<typeof createLighthouseGeometry> | Awaited<ReturnType<typeof loadLighthouseAsset>>
  let geometry: Geometry | undefined
  let layers: Record<'terrain' | 'cabins' | 'lighthouse', { node: Object3D; scale: Object3D['scale'] }[]> = { terrain: [], cabins: [], lighthouse: [] }
  const mount = (asset: Geometry) => {
    geometry?.dispose()
    geometry = asset
    anchors.left.add(asset.left)
    anchors.right.add(asset.right)
    for (const key of ['terrain', 'cabins', 'lighthouse'] as const) {
      layers[key] = asset[key].map(node => ({ node, scale: node.scale.clone() }))
    }
  }
  let disposed = false
  let request = 0
  const selectScene = (sceneId = 'lighthouse') => {
    const version = ++request
    if (geometry) geometry.left.visible = geometry.right.visible = false
    return loadLighthouseAsset(sceneId).then(asset => {
    if (version !== request || disposed) { asset.dispose(); return false }
    for (const surface of water.waters) surface.material.uniforms.color.value.copy(new Color(sceneId === 'iceberg' ? '#72949f' : '#647db7'))
    mount(asset)
    onAssetState?.('ready')
    return true
  }).catch(error => {
    if (disposed || version !== request) return false
    // Generate the expensive procedural textures and meshes only on failure.
    if (!geometry) mount(createLighthouseGeometry())
    console.warn('Lighthouse asset unavailable; keeping procedural scene.', error)
    onAssetState?.('fallback')
    return false
  })
  }
  const ready = selectScene()
  return {
    ready, selectScene,
    update(progress: number, timeSeconds = 0, motionEnabled = false) {
      anchors.update()
      water.update(progress, timeSeconds, motionEnabled)
      if (!geometry) return
      geometry.update(timeSeconds, motionEnabled)
      const state = getPopUpState(progress)
      geometry.left.visible = geometry.right.visible = progress > .012
      for (const key of ['terrain','cabins','lighthouse'] as const) {
        for (const {node,scale} of layers[key]) {
          const rise = node.userData.rigidCluster ? getRigidSceneRise(progress) : state[key]
          node.visible = rise > .001
          node.scale.set(scale.x,scale.y,scale.z*Math.max(.001,rise))
        }
      }
    },
    dispose() { disposed = true; water.dispose(); geometry?.dispose(); anchors.dispose() },
  }
}
