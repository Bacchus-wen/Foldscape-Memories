import { type Object3D, type SkinnedMesh } from 'three'
import { createPageAnchors } from './page-anchors'
import { createLighthouseGeometry } from './lighthouse-geometry'
import { createScreenPortal } from './screen-portal'
import { createSceneEnvironment } from './scene-environment'
import { loadLighthouseAsset } from './lighthouse-asset'
import { MEMORY_REFLECTION_LAYER } from './coastal-water'

export function createLighthouse(screen: SkinnedMesh, host: Object3D, onAssetState?: (state: 'ready' | 'fallback') => void) {
  const anchors = createPageAnchors(screen, host)
  const sceneAnchors = createPageAnchors(screen, host, true)
  const resolution = typeof window !== 'undefined' && window.innerWidth < 700 ? 512 : 1024
  let environment = createSceneEnvironment(anchors.left, anchors.right, 'lighthouse', resolution, screen)
  type Geometry = ReturnType<typeof createLighthouseGeometry> | Awaited<ReturnType<typeof loadLighthouseAsset>>
  let geometry: Geometry | undefined
  let portal: ReturnType<typeof createScreenPortal> | undefined
  let pose = { progress: 0, time: 0, motion: false }
  let layers: Record<'terrain' | 'cabins' | 'lighthouse', { node: Object3D; scale: Object3D['scale'] }[]> = { terrain: [], cabins: [], lighthouse: [] }
  const mount = (asset: Geometry) => {
    portal?.dispose()
    geometry?.dispose()
    geometry = asset
    // Meadow shoreline rocks belong to the stationary landscape, not the lid.
    // Include them in the same portal and disposal lifecycle as the house scene.
    if (environment.kind === 'meadow') {
      asset.left.add(environment.details[0])
      asset.right.add(environment.details[1])
    }
    for (const page of [asset.left, asset.right]) page.traverse(object => object.layers.enable(MEMORY_REFLECTION_LAYER))
    sceneAnchors.left.add(asset.left)
    sceneAnchors.right.add(asset.right)
    if ('animate' in asset && asset.animate) asset.animate(1)
    portal = createScreenPortal([asset.left, asset.right], [sceneAnchors.left, sceneAnchors.right], anchors.left, environment.kind === 'ice' ? '#d9e5e7' : '#b5aea1')
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
    // Apply the current closed/open pose before scheduling the first render.
    // A newly loaded scene otherwise flashes fully visible and synchronously
    // compiles its water, shadows and all model materials during photo browsing.
    update(pose.progress, pose.time, pose.motion)
    onAssetState?.('ready')
    return true
  }).catch(error => {
    if (disposed || version !== request) return false
    // Generate the expensive procedural textures and meshes only on failure.
    if (!geometry) mount(createLighthouseGeometry())
    update(pose.progress, pose.time, pose.motion)
    console.warn('Lighthouse asset unavailable; keeping procedural scene.', error)
    onAssetState?.('fallback')
    return false
  })
  }
  function update(progress: number, timeSeconds = 0, motionEnabled = false) {
      pose = { progress, time: timeSeconds, motion: motionEnabled }
      anchors.update()
      sceneAnchors.update()
      environment.update(progress, timeSeconds, motionEnabled)
      if (!geometry) return
      geometry.update(timeSeconds, motionEnabled)
      portal?.update(progress)
      if ('animate' in geometry && geometry.animate) { geometry.animate(1); return }
      for (const key of ['terrain','cabins','lighthouse'] as const) {
        for (const {node,scale} of layers[key]) {
          node.visible = true
          node.scale.copy(scale)
        }
      }
  }
  update(0)
  const ready = selectScene()
  return {
    ready, selectScene, update,
    dispose() { disposed = true; environment.dispose(); portal?.dispose(); geometry?.dispose(); anchors.dispose(); sceneAnchors.dispose() },
  }
}
