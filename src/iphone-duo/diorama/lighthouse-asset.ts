import { Group, Mesh, PointLight, Texture, type Object3D, type Material, type BufferGeometry } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createSpreadLayout } from './spread-layout.ts'

function assetDisposer(scene: Object3D) {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()
  scene.traverse(object => {
    if (!(object instanceof Mesh)) return
    geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material)
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value)
    }
  })
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    geometries.forEach(value => value.dispose())
    materials.forEach(value => value.dispose())
    textures.forEach(value => { value.dispose(); value.source.data?.close?.() })
  }
}

/** Convert the authored page coordinates without independently centering or scaling modules. */
export function prepareLighthouseAsset(scene: Object3D, sceneId?: string) {
  const disposeResources = assetDisposer(scene)
  const sources = ['Lighthouse', 'Cabin0', 'Cabin1', 'TerrainLeft', 'TerrainRight'].map(name => {
    const value = scene.getObjectByName(name)
    if (!value) { disposeResources(); throw new Error(`Lighthouse GLB missing ${name}`) }
    return value
  })
  const nodes = sources.map(source => {
    const root = new Group()
    root.name = `refined-${source.name}`
    root.userData.rigidCluster = source.userData.rigidCluster === true
    root.position.set(source.position.x, -source.position.z, source.position.y)
    source.position.set(0, 0, 0)
    const axis = new Group()
    axis.rotation.x = Math.PI / 2
    axis.add(source)
    root.add(axis)
    root.traverse(object => {
      if (!(object instanceof Mesh)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      // These small panes need transparency and highlights, not a full scene
      // refraction pass repeated again inside each water reflection.
      for (const material of materials) {
        if ('transmission' in material && Number(material.transmission) > 0) {
          material.transmission = 0
          material.transparent = true
          material.opacity = .18
          material.depthWrite = false
        }
      }
      object.castShadow = materials.every(material => !material.transparent && !('transmission' in material && Number(material.transmission) > 0))
      object.receiveShadow = true
      for (const material of materials) {
        if (material.transparent) material.depthWrite = false
        for (const value of Object.values(material)) if (value instanceof Texture) value.anisotropy = 4
      }
    })
    return root
  })
  const left = new Group(), right = new Group()
  left.name = 'lighthouse-left-page'
  right.name = 'lighthouse-right-page'
  left.add(nodes[1], nodes[2], nodes[3])
  right.add(nodes[0], nodes[4])
  const lantern = new PointLight('#ffc978', .02, .24, 2)
  lantern.name = 'warm-lantern-light'
  const lightAnchor = nodes[0].getObjectByName('LanternLightAnchor')
  lightAnchor?.add(lantern)
  const spread = sceneId ? createSpreadLayout(nodes,sceneId) : undefined
  return {
    nodes, left: spread?.left ?? left, right: spread?.right ?? right,
    terrain: spread?.terrain ?? [nodes[3],nodes[4]], cabins: spread?.cabins ?? [nodes[1],nodes[2]], lighthouse: spread?.lighthouse ?? [nodes[0]],
    animate: spread?.animate,
    composition: spread?.composition,
    update(timeSeconds = 0, motionEnabled = false) {
      lantern.intensity = motionEnabled ? .02 + Math.sin(timeSeconds * 1.7) * .002 : .02
      spread?.lights.forEach(light=>{light.intensity=lantern.intensity})
    },
    dispose() { spread?.dispose(); left.removeFromParent(); right.removeFromParent(); nodes.forEach(node => node.removeFromParent()); disposeResources() },
  }
}

export async function loadLighthouseAsset(sceneId = 'lighthouse') {
  const paths: Record<string, string> = {
    lighthouse: '/scenes/lighthouse/lighthouse-memory-v2.glb',
    iceberg: '/scenes/iceberg/iceberg-memory.glb',
    'coastal-house': '/scenes/coastal-house/coastal-house-memory.glb',
    santorini: '/scenes/santorini/santorini-memory.glb',
    'osaka-castle': '/scenes/osaka-castle/osaka-castle-memory.glb',
  }
  const gltf = await new GLTFLoader().loadAsync(paths[sceneId] ?? paths.lighthouse)
  return prepareLighthouseAsset(gltf.scene, sceneId)
}
