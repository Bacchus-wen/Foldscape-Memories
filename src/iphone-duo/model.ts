import { AnimationMixer, Box3, Group, Material, Mesh, MeshStandardMaterial, Texture, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createScreenMaterial } from './screen-material'
import { fillRearPanelOpenings } from './rear-panel'

export async function loadPhone(url: string) {
  const source = await new GLTFLoader().loadAsync(url)
  // Apple authors the rig in XZ; normalize once, outside the animated skeleton.
  const body = new Group()
  const displayFrame = new Group()
  body.add(displayFrame)
  displayFrame.add(source.scene)
  source.scene.rotation.x = Math.PI / 2
  fillRearPanelOpenings(source.scene)
  const left = body.getObjectByName('folding-half')
  const slider = source.animations.find(clip => clip.name === 'Slider')
  if (!left && !slider) throw new Error('Model is missing fold animation data.')
  const screen = createScreenMaterial(false)
  const cover = createScreenMaterial(true)
  const materials = new Set<Material>([screen, cover])
  const finishMaterials = new Set<MeshStandardMaterial>()
  const backMaterials = new Set<MeshStandardMaterial>()
  const cameraIslandMaterials = new Set<MeshStandardMaterial>()
  const cameraRingMaterials = new Set<MeshStandardMaterial>()
  const sensorMaterials = new Set<MeshStandardMaterial>()
  const innerGlassMaterials = new Set<MeshStandardMaterial>()
  const frameMaterialNames = ['lrXfpZcYrByzvym', 'mAvfMvCzYIPKaNG', 'UcYWmlwZxcfqNko', 'stlMkdXkRsspsoE', 'NtNSwEIIFmIbXaY', 'jeFtQmHBLCfgIkY']
  const backMaterialNames = ['ZoizrWFccovSVQl', 'QTguOGnxQOXIuCV', 'MZiYIrcFSqDDBWG']
  const cameraIslandMeshNames = ['nQVCQjoYoIWfEsS']
  const sensorMeshNames = ['mvzihbRwSOMHmVz', 'DPkwNmCcKsxyTYI', 'DSEWTtaQqcCyhXV']
  const innerGlassMeshNames = [
    'xXaPQFYQEWApWlF',
    'TZjfnhYrtCYbdCh',
    'CZvdQpUbSHHiYsu',
    'XhJqNmvXbohGMop',
  ]
  const cameraRingMaterialNames = ['jqlebwNqkTyrcyd', 'OwqobJiNTlvAFyj']
  body.traverse(object => {
    if (!(object instanceof Mesh)) return
    let originals = Array.isArray(object.material) ? object.material : [object.material]
    const isInnerScreen = object.name === 'skeleton_0_3_screenTexture_geo' || originals.some(material => material.name === 'inner-screen')
    const isCoverScreen = object.name === 'skeleton_0_7_outerDisplayScreenTexture_geo' || originals.some(material => material.name === 'cover-screen')
    if (innerGlassMeshNames.includes(object.name)) {
      originals = originals.map(material => {
        if (!(material instanceof MeshStandardMaterial)) return material
        const glassMaterial = material.clone()
        glassMaterial.name = `${material.name}-inner-tempered-glass`
        glassMaterial.color.set('#010205')
        glassMaterial.envMapIntensity = 0.32
        glassMaterial.roughness = 0.08
        glassMaterial.metalness = 0.02
        if ('clearcoat' in glassMaterial) {
          glassMaterial.clearcoat = 1
          glassMaterial.clearcoatRoughness = 0.045
        }
        glassMaterial.needsUpdate = true
        materials.add(glassMaterial)
        innerGlassMaterials.add(glassMaterial)
        return glassMaterial
      })
      object.material = Array.isArray(object.material) ? originals : originals[0]
    }
    if (!isInnerScreen && !isCoverScreen && cameraIslandMeshNames.includes(object.name)) {
      originals = originals.map(material => {
        if (!(material instanceof MeshStandardMaterial)) return material
        const cameraMaterial = material.clone()
        cameraMaterial.name = `${material.name}-camera-island`
        materials.add(cameraMaterial)
        cameraIslandMaterials.add(cameraMaterial)
        return cameraMaterial
      })
      object.material = Array.isArray(object.material) ? originals : originals[0]
    }
    if (!isInnerScreen && !isCoverScreen && sensorMeshNames.includes(object.name)) {
      originals = originals.map(material => {
        if (!(material instanceof MeshStandardMaterial)) return material
        const sensorMaterial = material.clone()
        sensorMaterial.name = `${material.name}-dark-sensor`
        materials.add(sensorMaterial)
        sensorMaterials.add(sensorMaterial)
        return sensorMaterial
      })
      object.material = Array.isArray(object.material) ? originals : originals[0]
    }
    originals.forEach(material => {
      materials.add(material)
      if (isInnerScreen || isCoverScreen || !(material instanceof MeshStandardMaterial)) return
      if (frameMaterialNames.includes(material.name)) finishMaterials.add(material)
      if (backMaterialNames.includes(material.name)) backMaterials.add(material)
      if (cameraRingMaterialNames.includes(material.name)) cameraRingMaterials.add(material)
      // This material is used only by the separate rear logo geometry.
      if (material.name === 'ZgMnqnyPATyacDv') material.visible = false
    })
    if (isInnerScreen) object.material = screen
    if (isCoverScreen) object.material = cover
  })
  const mixer = slider ? new AnimationMixer(body) : undefined
  const sliderAction = slider && mixer ? mixer.clipAction(slider) : undefined
  sliderAction?.play()
  if (sliderAction) sliderAction.paused = true
  const applyFold = (progress: number, angle: number) => {
    if (sliderAction && mixer && slider) {
      sliderAction.time = Math.max(0, Math.min(1, progress)) * slider.duration
      mixer.update(0)
    } else if (left) {
      left.rotation.y = angle
    }
  }

  // Calculating a precise animated bounding box on every render frame makes
  // the root chase small extrema changes in the skinned mesh and is expensive
  // enough to cause visible pose-transition judder. Sample the model's local
  // center once, then interpolate that stable curve while folding.
  const centerBounds = new Box3()
  const centerSamples: Vector3[] = []
  const centerSampleCount = 24
  body.position.set(0, 0, 0)
  body.rotation.set(0, 0, 0)
  displayFrame.position.set(0, 0, 0)
  for (let index = 0; index <= centerSampleCount; index += 1) {
    const progress = index / centerSampleCount
    applyFold(progress, (1 - progress) * Math.PI)
    displayFrame.position.set(0, 0, 0)
    body.updateMatrixWorld(true)
    centerBounds.setFromObject(displayFrame, true)
    centerSamples.push(centerBounds.getCenter(new Vector3()))
  }

  const interpolatedCenter = new Vector3()
  const setFold = (progress: number, angle: number) => {
    const clamped = Math.max(0, Math.min(1, progress))
    applyFold(clamped, angle)
    const samplePosition = clamped * centerSampleCount
    const lowerIndex = Math.floor(samplePosition)
    const upperIndex = Math.min(centerSampleCount, lowerIndex + 1)
    interpolatedCenter
      .copy(centerSamples[lowerIndex])
      .lerp(centerSamples[upperIndex], samplePosition - lowerIndex)
    displayFrame.position.copy(interpolatedCenter).multiplyScalar(-1)
    body.updateMatrixWorld(true)
  }

  setFold(0, Math.PI)
  const pivotCenter = new Box3().setFromObject(displayFrame).getCenter(new Vector3())
  return { body, displayFrame, screen, cover, setFold, pivotCenter, sourceKind: slider ? 'apple-gltf' : 'processed-glb', finishMaterials: [...finishMaterials], backMaterials: [...backMaterials], cameraIslandMaterials: [...cameraIslandMaterials], cameraRingMaterials: [...cameraRingMaterials], sensorMaterials: [...sensorMaterials], innerGlassMaterials: [...innerGlassMaterials], dispose() {
    mixer?.stopAllAction()
    mixer?.uncacheRoot(body)
    body.traverse(object => { if (object instanceof Mesh) object.geometry.dispose() })
    const textures = new Set<Texture>()
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value)
      material.dispose()
    }
    for (const texture of textures) texture.dispose()
  } }
}
