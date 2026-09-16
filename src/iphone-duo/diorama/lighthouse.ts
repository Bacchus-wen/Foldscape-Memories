import { type Object3D, type SkinnedMesh } from 'three'
import { createPageAnchors } from './page-anchors'
import { createLighthouseGeometry } from './lighthouse-geometry'
import { getPopUpState } from './pop-up-motion'
import { createSceneEnvironment } from './scene-environment'
import { loadLighthouseAsset } from './lighthouse-asset'

export function createLighthouse(screen: SkinnedMesh, host: Object3D, onAssetState?: (state: 'ready' | 'fallback') => void) {
  const anchors = createPageAnchors(screen, host)
  const resolution = typeof window !== 'undefined' && window.innerWidth < 700 ? 512 : 1024
  let environment = createSceneEnvironment(anchors.left, anchors.right, 'lighthouse', resolution, screen)
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
    environment.dispose()
    environment = createSceneEnvironment(anchors.left, anchors.right, sceneId, resolution, screen)
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
      environment.update(progress, timeSeconds, motionEnabled)
      if (!geometry) return
      geometry.update(timeSeconds, motionEnabled)
      const state = getPopUpState(progress)
      geometry.left.visible = geometry.right.visible = progress > .012
      if ('animate' in geometry && geometry.animate) { geometry.animate(progress); return }
      for (const key of ['terrain','cabins','lighthouse'] as const) {
        for (const {node,scale} of layers[key]) {
          const rise = state[key]
          node.visible = rise > .001
          node.scale.set(scale.x,scale.y,scale.z*Math.max(.001,rise))
        }
      }
    },
    dispose() { disposed = true; environment.dispose(); geometry?.dispose(); anchors.dispose() },
  }
}
