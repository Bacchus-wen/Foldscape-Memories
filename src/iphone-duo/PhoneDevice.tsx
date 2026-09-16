import { useEffect, useEffectEvent, useRef, useState, type ComponentProps } from 'react'
import { useMotionValueEvent, useReducedMotion, type MotionValue } from 'motion/react'
import { ACESFilmicToneMapping, AmbientLight, BoxGeometry, DirectionalLight, Mesh, MeshBasicMaterial, PerspectiveCamera, PMREMGenerator, Scene, SRGBColorSpace, VideoTexture, LinearMipmapLinearFilter, TextureLoader, Vector2, WebGLRenderer, PCFShadowMap, type Texture, type SkinnedMesh } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { loadPhone } from './model'
import { createCoverMorph } from './cover-morph'
import { MEMORY_PHOTOS } from './memory-photos'
import { samplePhotoJourney } from './photo-journey'
import { createFrameBudget, scenePixelRatio } from './frame-budget.js'
import { frameSceneCamera, sceneFrameAdjustment } from './frame-camera.js'
import { foldChoreography } from './fold-choreography'
import { useFoldablePhone } from './FoldablePhone'
import { createScreenContentTexture } from './cover-content'
import { createLighthouse } from './diorama/lighthouse'
import { MEMORY_MAX_ZOOM } from './diorama/memory-presentation'
import { MEMORY_REFLECTION_LAYER } from './diorama/coastal-water'
import { damp, normalizeWheel, releaseStep, rotationDelta } from './gesture-motion'

type PhoneModel = Awaited<ReturnType<typeof loadPhone>>
type Surface = { scene: Scene; model: PhoneModel; renderer: WebGLRenderer; camera: PerspectiveCamera; draw: () => void; warmup: () => Promise<void>; finish?: string; diorama?: ReturnType<typeof createLighthouse> }
type DeviceRotation = { x: number; y: number; z: number }
type DragState = { mode: 'fold'; x: number; value: number; moved: boolean } | { mode: 'rotate'; x: number; y: number; rotation: DeviceRotation; moved: boolean; lastX: number; lastY: number; lastTime: number; vx: number; vy: number }
export type PhoneDeviceProps = ComponentProps<'div'> & { homeScale?: number; homeInspection?: MotionValue<number>; homeWheel?: boolean; browsePhotos?: boolean; coverPhotoPosition?: MotionValue<number>; coverPhotoActive?: boolean; coverPhotoRetraction?: number; onCoverPhotoState?: (state: { ready: boolean; prepared: boolean; index: number; target: number; busy: boolean; error: string }) => void; diorama?: boolean; memorySceneId?: string; onSceneReadyChange?: (ready: boolean) => void; sceneMotion?: boolean; interactionEpoch?: number; onReadyChange?: (ready: boolean) => void; modelSrc: string; screenSrc: string; videoSrc?: string; videoPlaying?: boolean; wallpaperMode?: string; screenOrientation?: number; screenLayoutVariant?: 'default' | 'seated'; foldEffects?: boolean; foldProjection?: boolean; innerFocusFlip?: boolean; coverSrc?: string; rotation?: number; rotationX?: number; rotationZ?: number; exposure?: number; blur?: number; parallax?: number; screenOverlaySrc?: string; coverOverlaySrc?: string; revealSrc?: string; depthSrc?: string; depthEnabled?: boolean; depthStrength?: number; finish?: 'night-sky' | 'star-white'; dragToRotate?: boolean; sceneOrbit?: boolean; onRotationStart?: () => void; onRotationEnd?: () => void; onRotationChange?: (rotation: DeviceRotation) => void; zoom?: number; zoomScale?: number; onZoomChange?: (zoom: number) => void; language?: 'zh' | 'en' }

const DEVICE_STATUS_COPY = {
  zh: {
    loading: '正在载入 Apple 模型…', webgl: 'WebGL 2 不可用，请开启硬件加速后查看模型。', model: 'Apple 模型载入失败，请刷新后重试。',
    screen: '屏幕图片载入失败，请选择其他图片。', videoPlay: '请点击播放视频壁纸。', video: '视频无法播放，请换用 H.264 MP4 或 WebM。',
    content: '屏幕内容载入失败，请重试。', depth: '深度图载入失败，请选择其他图片。', rotate: '旋转手机', fold: '折叠或展开手机',
  },
  en: {
    loading: 'Loading Apple model…', webgl: 'WebGL 2 is unavailable. Enable hardware acceleration to view the phone.', model: 'The Apple model could not load. Reload to try again.',
    screen: 'A screen image could not load. Choose another image.', videoPlay: 'Click play to start the video wallpaper.', video: 'The video cannot play. Try H.264 MP4 or WebM.',
    content: 'Screen content could not load. Try again.', depth: 'The depth image could not load. Choose another image.', rotate: 'Rotate phone', fold: 'Fold or unfold phone',
  },
} as const

type DeviceStatusKey = '' | keyof typeof DEVICE_STATUS_COPY.zh

function addStudioReflectors(environment: Scene) {
  const geometry = new BoxGeometry(1, 1, 1)
  const material = new MeshBasicMaterial({ color: 0x030405 })
  const placements = [
    { position: [-6.8, 5, 12.4], scale: [2.2, 17, 0.18] },
    { position: [6.8, 5, 12.4], scale: [2.2, 17, 0.18] },
    { position: [-12.4, 4, -1.5], scale: [0.18, 17, 3.2] },
  ]
  placements.forEach(({ position, scale }) => {
    const reflector = new Mesh(geometry, material)
    reflector.position.set(...position)
    reflector.scale.set(...scale)
    environment.add(reflector)
  })
}

export function PhoneDevice(props: PhoneDeviceProps) {
  return <PhoneDeviceSurface key={props.modelSrc} {...props} />
}

function PhoneDeviceSurface({ homeScale = 1, homeInspection, homeWheel = false, browsePhotos = false, coverPhotoPosition, coverPhotoActive = true, coverPhotoRetraction = 0, onCoverPhotoState, diorama = false, memorySceneId = 'lighthouse', onSceneReadyChange, sceneMotion = true, interactionEpoch = 0, onReadyChange, modelSrc, screenSrc, coverSrc = screenSrc, videoSrc, videoPlaying = true, wallpaperMode = "full", screenOrientation = 0, screenLayoutVariant = 'default', foldEffects = true, foldProjection = true, innerFocusFlip = false, screenOverlaySrc, coverOverlaySrc, revealSrc, depthSrc, depthEnabled = true, depthStrength = 0.3, finish = 'star-white', rotation = -6, rotationX = 0, rotationZ = 0, dragToRotate = false, sceneOrbit = false, onRotationStart, onRotationEnd, onRotationChange, zoom = 0.991875, zoomScale = 1, onZoomChange, exposure = 1.2, blur = 28, parallax = 1, language = 'en', className = '', ...props }: PhoneDeviceProps) {
  const { progress, setValue, toggle } = useFoldablePhone()
  const reducedMotion = useReducedMotion()
  const canvas = useRef<HTMLCanvasElement>(null)
  const interactionTarget = useRef<HTMLButtonElement>(null)
  const surface = useRef<Surface | undefined>(undefined)
  const videoElement = useRef<HTMLVideoElement | null>(null)
  const drag = useRef<DragState | undefined>(undefined)
  const suppressClick = useRef(false)
  const points = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; zoom: number } | undefined>(undefined)
  const inertiaFrame = useRef(0)
  const zoomFrame = useRef(0)
  const zoomTarget = useRef(zoom)
  const liveView = useRef({ rotation: { x: rotationX, y: rotation, z: rotationZ }, zoom })
  liveView.current = { rotation: { x: rotationX, y: rotation, z: rotationZ }, zoom }
  const sceneTime = useRef(0)
  const cancelDynamics = () => {
    cancelAnimationFrame(inertiaFrame.current)
    cancelAnimationFrame(zoomFrame.current)
    inertiaFrame.current = zoomFrame.current = 0
    zoomTarget.current = liveView.current.zoom
  }
  useEffect(() => {
    cancelDynamics()
    points.current.clear(); pinch.current = undefined; drag.current = undefined
  }, [interactionEpoch])
  useEffect(() => {
    if (!onZoomChange || browsePhotos || homeWheel) return
    const target = interactionTarget.current
    const preventScroll = (event: WheelEvent) => event.preventDefault()
    target?.addEventListener('wheel', preventScroll, { passive: false })
    return () => target?.removeEventListener('wheel', preventScroll)
  }, [Boolean(onZoomChange), browsePhotos, homeWheel])
  useEffect(() => () => cancelDynamics(), [])
  const requestZoom = (target: number) => {
    zoomTarget.current = Math.max(.72, Math.min(MEMORY_MAX_ZOOM, target))
    if (zoomFrame.current) return
    if (reducedMotion) { onZoomChange?.(zoomTarget.current); return }
    let last = performance.now()
    const animate = (time: number) => {
      const next = damp(liveView.current.zoom, zoomTarget.current, Math.min(.05, (time - last) / 1000))
      last = time
      const settled = Math.abs(next - zoomTarget.current) < .0005
      liveView.current.zoom = settled ? zoomTarget.current : next
      onZoomChange?.(liveView.current.zoom)
      zoomFrame.current = settled ? 0 : requestAnimationFrame(animate)
    }
    zoomFrame.current = requestAnimationFrame(animate)
  }
  const finishRotation = (start: DragState | undefined, cancelled = false) => {
    if (start?.mode !== 'rotate' || cancelled || reducedMotion || !start.moved || performance.now() - start.lastTime > 100) {
      onRotationEnd?.()
      return
    }
    let vx = Math.max(-180, Math.min(180, start.vx)), vy = Math.max(-90, Math.min(90, start.vy))
    let last = performance.now()
    const animate = (time: number) => {
      const seconds = Math.min(.05, (time - last) / 1000)
      last = time
      const x = releaseStep(vx, seconds), y = releaseStep(vy, seconds)
      vx = x.velocity; vy = y.velocity
      const current = liveView.current.rotation
      const next = sceneOrbit ? { ...current, z: current.z - x.distance } : { ...current, y: current.y + x.distance, x: Math.max(-72, Math.min(72, current.x + y.distance)) }
      liveView.current.rotation = next
      onRotationChange?.(next)
      if (Math.hypot(vx, vy) > .5) inertiaFrame.current = requestAnimationFrame(animate)
      else { inertiaFrame.current = 0; onRotationEnd?.() }
    }
    inertiaFrame.current = requestAnimationFrame(animate)
  }
  const depthPointer = useRef(new Vector2())
  const [statusKey, setStatusKey] = useState<DeviceStatusKey>('')
  const status = statusKey ? DEVICE_STATUS_COPY[language][statusKey] : ''
  const [ready, setReady] = useState(false)
  useEffect(() => { onReadyChange?.(ready) }, [ready, onReadyChange])
  const loadedScene = useRef('lighthouse')
  const preparation = useRef<Promise<void> | null>(null)
  useEffect(() => {
    if (!ready || !surface.current?.diorama || loadedScene.current === memorySceneId) return
    let cancelled = false
    loadedScene.current = memorySceneId
    onSceneReadyChange?.(false)
    const current = surface.current
    // Photo input is already live. Keep the preparing model's materials alive
    // until compileAsync releases them, then mount only the latest selection.
    const select = async () => {
      await preparation.current?.catch(() => {})
      if (cancelled || surface.current !== current) return false
      const loaded = await current.diorama!.selectScene(memorySceneId)
      if (loaded && !cancelled && surface.current === current) {
        update()
        preparation.current = current.warmup()
        await preparation.current.catch(error => console.warn('Scene preparation deferred to first render.', error))
      }
      return loaded
    }
    const timer = window.setTimeout(() => select().then(loaded => {
      if (cancelled || !loaded) return
      // All scene swaps wait for preparation above, keeping compiled materials alive.
      update()
      onSceneReadyChange?.(true)
    }), 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [ready, memorySceneId])
  const [entered, setEntered] = useState(false)
  const coverMorph = useRef<ReturnType<typeof createCoverMorph> | null>(null)
  const frameTop = useRef(0)
  const hasCoverMorph = coverPhotoPosition !== undefined
  const reportCoverPhoto = useEffectEvent(state => onCoverPhotoState?.(state))
  useEffect(() => {
    if (!ready || !surface.current || !hasCoverMorph) return
    const current = surface.current
    const morph = createCoverMorph({ material: current.model.cover, photos: MEMORY_PHOTOS,
      draw: current.draw, element: current.renderer.domElement, onState: reportCoverPhoto, scene: current.scene,
      coverMesh: current.model.body.getObjectByName('skeleton_0_7_outerDisplayScreenTexture_geo'),
      warmup: () => { preparation.current = current.warmup(); return preparation.current } })
    coverMorph.current = morph
    return () => { morph.dispose(preparation.current); coverMorph.current = null }
  }, [ready, hasCoverMorph])
  useEffect(() => {
    if (!ready || !coverPhotoPosition) return
    const seek = (value: number) => {
      coverMorph.current?.seek(value)
      const current = surface.current
      if (!current || progress.get() > .002) return
      const base = samplePhotoJourney(value, MEMORY_PHOTOS.length).scale
      current.camera.zoom = base + (1.5 - base) * (homeInspection?.get() ?? 0)
      current.camera.updateProjectionMatrix()
      current.draw()
    }
    seek(coverPhotoPosition.get())
    return coverPhotoPosition.on('change', seek)
  }, [ready, coverPhotoPosition, progress])
  useEffect(() => { coverMorph.current?.activity(coverPhotoActive, Boolean(reducedMotion), coverPhotoRetraction) }, [ready, coverPhotoActive, reducedMotion, coverPhotoRetraction])
  useEffect(() => {
    if (!homeInspection || !ready) return
    const apply = () => {
      const value = homeInspection.get()
      coverMorph.current?.activity(coverPhotoActive, Boolean(reducedMotion), Math.max(coverPhotoRetraction, value))
      update()
    }
    apply()
    return homeInspection.on('change', apply)
  }, [ready, homeInspection, coverPhotoActive, coverPhotoRetraction, reducedMotion])
  const [amount, setAmount] = useState(progress.get())
  const quarterTurnLayout = Math.abs(Math.sin(screenOrientation)) > 0.5
  const update = useEffectEvent(() => {
    const current = surface.current
    if (!current) return
    const p = Math.max(0, Math.min(1, progress.get()))
    const motion = foldChoreography(p)
    const { angle } = motion
    current.model.screen.uniforms.foldEffects.value = foldEffects ? 1 : 0
    current.model.cover.uniforms.foldEffects.value = foldEffects ? 1 : 0
    current.model.screen.uniforms.foldProjection.value = foldProjection ? 1 : 0
    current.model.cover.uniforms.foldProjection.value = foldProjection ? 1 : 0
    current.model.screen.uniforms.contentRotation.value = screenOrientation
    current.model.cover.uniforms.contentRotation.value = screenOrientation
    current.model.screen.uniforms.dualWallpaper.value = wallpaperMode === 'dual' ? 1 : 0
    current.model.screen.uniforms.defocus.value = motion.innerDefocus
    current.model.screen.uniforms.focusEdge.value = motion.innerFocusEdge
    current.model.screen.uniforms.innerFocusFlip.value = innerFocusFlip ? 1 : 0
    current.model.cover.uniforms.focusEdge.value = motion.coverFocusEdge
    current.model.cover.uniforms.defocus.value = motion.coverDefocus
    // Match the fully open portrait display luminance in the seated pose.
    current.model.screen.uniforms.screenBrightness.value = screenLayoutVariant === 'seated'
      ? 1
      : motion.innerBrightness
    current.model.screen.uniforms.wallpaperShift.value = reducedMotion ? 0 : motion.innerWallpaperShift
    current.model.cover.uniforms.wallpaperShift.value = reducedMotion ? 0 : motion.coverWallpaperShift
    current.model.screen.uniforms.contentShift.value = reducedMotion ? 0 : motion.innerContentShift
    current.model.cover.uniforms.contentShift.value = reducedMotion ? 0 : motion.coverContentShift
    current.model.screen.uniforms.progress.value = p
    current.model.cover.uniforms.progress.value = p
    current.model.screen.uniforms.blur.value = blur
    current.model.cover.uniforms.blur.value = blur
    current.model.setFold(motion.hinge, angle)
    current.model.body.rotation.y = rotation * Math.PI / 180
    current.model.body.rotation.x = rotationX * Math.PI / 180
    current.model.body.rotation.z = rotationZ * Math.PI / 180
    current.camera.position.z = 36 / Math.max(0.72, Math.min(3.1, zoom * zoomScale))
    const framing = sceneFrameAdjustment(diorama ? p : 0)
    current.camera.zoom = (homeScale + (1.5 - homeScale) * (homeInspection?.get() ?? 0)) * framing.scale
    if (diorama && current.camera.view) current.camera.view.offsetY = -frameTop.current - framing.offsetY
    current.camera.updateProjectionMatrix()
    current.model.screen.uniforms.parallax.value = reducedMotion ? 0 : parallax
    current.model.cover.uniforms.parallax.value = reducedMotion ? 0 : parallax
    for (const material of [current.model.screen, current.model.cover]) {
      material.uniforms.hasDepth.value = depthEnabled && material.uniforms.depthMap.value ? 1 : 0
      material.uniforms.depthStrength.value = depthStrength
      material.uniforms.depthPointer.value.copy(depthPointer.current)
    }
    if (current.finish !== finish) {
      const frame = finish === 'night-sky'
        ? { color: '#071426', intensity: 1.32, roughness: 0.16, metalness: 0.92 }
        : { color: '#dededa', intensity: 2.05, roughness: 0.055, metalness: 1 }
      const back = finish === 'night-sky'
        ? { color: '#0c1929', intensity: 0.58, roughness: 0.64, metalness: 0.06 }
        : { color: '#f2f1ed', intensity: 0.9, roughness: 0.46, metalness: 0.08 }
      const cameraIsland = finish === 'night-sky'
        ? { color: '#091625', intensity: 0.72, roughness: 0.48, metalness: 0.14 }
        : { color: '#f0eee9', intensity: 0.94, roughness: 0.4, metalness: 0.1 }
      const cameraRing = finish === 'night-sky'
        ? { color: '#01050b', intensity: 0.18, roughness: 0.34, metalness: 0.24 }
        : { color: '#dedbd4', intensity: 1.2, roughness: 0.12, metalness: 0.92 }
      const sensor = finish === 'night-sky'
        ? { color: '#010205', intensity: 0.18, roughness: 0.34, metalness: 0.06 }
        : { color: '#3c3c3f', intensity: 0.3, roughness: 0.42, metalness: 0.04 }
      current.model.finishMaterials.forEach(material => {
        material.color.set(frame.color)
        material.envMapIntensity = frame.intensity
        material.roughness = frame.roughness
        material.metalness = frame.metalness
        if ('clearcoat' in material) {
          material.clearcoat = finish === 'star-white' ? 1 : 0.55
          material.clearcoatRoughness = finish === 'star-white' ? 0.025 : 0.08
        }
        material.needsUpdate = true
      })
      current.model.backMaterials.forEach(material => {
        material.color.set(back.color)
        material.envMapIntensity = back.intensity
        material.roughness = back.roughness
        material.metalness = back.metalness
        material.needsUpdate = true
      })
      current.model.cameraIslandMaterials.forEach(material => {
        material.color.set(cameraIsland.color)
        material.envMapIntensity = cameraIsland.intensity
        material.roughness = cameraIsland.roughness
        material.metalness = cameraIsland.metalness
        material.needsUpdate = true
      })
      current.model.cameraRingMaterials.forEach(material => {
        material.color.set(cameraRing.color)
        material.envMapIntensity = cameraRing.intensity
        material.roughness = cameraRing.roughness
        material.metalness = cameraRing.metalness
        material.needsUpdate = true
      })
      current.model.sensorMaterials?.forEach(material => {
        material.color.set(sensor.color)
        material.envMapIntensity = sensor.intensity
        material.roughness = sensor.roughness
        material.metalness = sensor.metalness
        material.needsUpdate = true
      })
      current.finish = finish
    }
    // The loader centers the animated model from a pre-sampled local centroid
    // curve. Keep the root fixed at the stage origin so pose rotation and fold
    // animation cannot feed back into another per-frame centering transform.
    current.model.body.position.set(0, 0, 0)
    current.model.body.updateMatrixWorld(true)
    current.diorama?.update(p, sceneTime.current, sceneMotion && !reducedMotion)
    current.model.screen.uniforms.bodyInverse.value.copy(current.model.displayFrame.matrixWorld).invert()
    current.model.cover.uniforms.bodyInverse.value.copy(current.model.displayFrame.matrixWorld).invert()
    current.renderer.toneMappingExposure = exposure
    current.draw()
  })
  useMotionValueEvent(progress, 'change', setAmount)
  useEffect(() => { update() }, [rotation, rotationX, rotationZ, zoom, zoomScale, homeScale, exposure, blur, parallax, reducedMotion, depthEnabled, depthStrength, finish, wallpaperMode, screenOrientation, foldEffects, foldProjection, innerFocusFlip, sceneMotion])
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const context = element.getContext('webgl2', { alpha: true, antialias: true, preserveDrawingBuffer: true })
    if (!context) { setStatusKey('webgl'); return }
    const renderer = new WebGLRenderer({ canvas: element, context, alpha: true, antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = ACESFilmicToneMapping
    if (diorama) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap }
    const scene = new Scene()
    const camera = new PerspectiveCamera(30, 1, 0.1, 100)
    camera.position.set(0, 0, 36)
    const environment = new RoomEnvironment()
    addStudioReflectors(environment)
    const generator = new PMREMGenerator(renderer)
    const environmentMap = generator.fromScene(environment)
    scene.environment = environmentMap.texture
    environment.dispose()
    generator.dispose()
    scene.add(new AmbientLight(diorama ? 0x889bc9 : 0xffffff, diorama ? .32 : 1.5))
    const key = new DirectionalLight(diorama ? 0xffceb1 : 0xffffff, diorama ? 2.5 : 3)
    key.position.set(-8, 12, 20)
    if (diorama) {
      key.castShadow = true
      scene.environmentIntensity = .32
      key.position.set(-12, 8, 12)
      const fill = new DirectionalLight(0x90a8df, .55)
      fill.position.set(10, 1, 8)
      scene.add(fill)
      key.shadow.mapSize.set(2048,2048)
      Object.assign(key.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: .5, far: 70 })
      key.shadow.normalBias = .014
      key.shadow.bias = -.00015
    }
    scene.add(key)
    if (diorama) scene.traverse(object => { if ('isLight' in object) object.layers.enable(MEMORY_REFLECTION_LAYER) })
    let disposed = false
    let model: PhoneModel | undefined
    renderer.info.autoReset = false
    let drawFrame = 0
    const frameReady = createFrameBudget(60)
    let lastReport = -Infinity
    let lastRendered = 0
    const frameTimes: number[] = []
    const projectTimes: number[] = []
    const submitTimes: number[] = []
    let renderPeak = 0, renderStalls = 0
    const renderNow = () => {
      drawFrame = 0
      const before = performance.now()
      if (diorama && !frameReady(before)) {
        drawFrame = requestAnimationFrame(renderNow)
        return
      }
      // A demand-rendered page can sit still for minutes; idle time is not a dropped frame.
      if (lastRendered && before - lastRendered < 1000) {
        frameTimes.push(before - lastRendered)
        if (frameTimes.length > 90) frameTimes.shift()
      } else { frameTimes.length = 0; projectTimes.length = 0; submitTimes.length = 0 }
      lastRendered = before
      renderer.info.reset()
      coverMorph.current?.project(camera)
      const projected = performance.now()
      renderer.render(scene, camera)
      const renderMs = performance.now() - before
      if (renderMs > renderPeak) {
        renderPeak = renderMs
        element.dataset.peakProgress = progress.get().toFixed(3)
      }
      if (renderMs > 50) renderStalls++
      projectTimes.push(projected - before)
      submitTimes.push(performance.now() - projected)
      if (projectTimes.length > 90) { projectTimes.shift(); submitTimes.shift() }
      if (diorama && (before - lastReport >= 250 || renderMs > 50)) {
        lastReport = before
        element.dataset.drawCalls = String(renderer.info.render.calls)
        element.dataset.triangles = String(renderer.info.render.triangles)
        element.dataset.geometries = String(renderer.info.memory.geometries)
        element.dataset.renderMs = (performance.now() - before).toFixed(2)
        element.dataset.renderPeak = renderPeak.toFixed(2)
        element.dataset.renderStalls = String(renderStalls)
        element.dataset.programs = String(renderer.info.programs?.length)
        element.dataset.projectMs = (projectTimes.reduce((a, b) => a + b, 0) / projectTimes.length).toFixed(2)
        element.dataset.submitMs = (submitTimes.reduce((a, b) => a + b, 0) / submitTimes.length).toFixed(2)
        element.dataset.frameSamples = String(frameTimes.length)
        if (frameTimes.length >= 5) {
          const sorted = [...frameTimes].sort((a, b) => a - b)
          element.dataset.frameMs = (frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length).toFixed(2)
          element.dataset.frameP95 = sorted[Math.floor(sorted.length * .95)].toFixed(2)
        }
      }
    }
    const render = () => { if (!drawFrame) drawFrame = requestAnimationFrame(renderNow) }
    const resize = () => {
      const { width, height } = element.getBoundingClientRect()
      if (!width || !height) return
      if (diorama) {
        const ratio = scenePixelRatio(width, height, window.devicePixelRatio)
        if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio)
        element.dataset.renderScale = ratio.toFixed(2)
      }
      renderer.setSize(width, height, false)
      if (diorama) {
        const style = getComputedStyle(element)
        frameTop.current = parseFloat(style.getPropertyValue('--memory-frame-top')) || 0
        frameSceneCamera(camera, width, height,
          parseFloat(style.getPropertyValue('--memory-frame-top')) || 0,
          parseFloat(style.getPropertyValue('--memory-frame-bottom')) || 0)
        if (camera.view) camera.view.offsetY -= sceneFrameAdjustment(progress.get()).offsetY
        camera.updateProjectionMatrix()
      } else {
        camera.aspect = width / height
        const span = Math.max(16, 21 / camera.aspect)
        camera.fov = 2 * Math.atan(span / 72) * 180 / Math.PI
        camera.updateProjectionMatrix()
      }
      render()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    const unsubscribe = progress.on('change', () => update())
    loadPhone(modelSrc).then(loaded => {
      if (disposed) { loaded.dispose(); return }
      model = loaded
      scene.add(model.body)
      const miniature = diorama ? createLighthouse(model.body.getObjectByName('skeleton_0_3_screenTexture_geo') as SkinnedMesh, model.displayFrame, state => {
        element.dataset.lighthouseAsset = state
        render()
      }) : undefined
      const warmup = async () => {
        const sceneId = loadedScene.current
        await miniature?.ready
        if (disposed) return
        const started = performance.now()
        // Compile both light configurations (closed / revealed lantern), then
        // prime shadow and reflection programs with the real output format. Merely
        // compiling the closed scene misses the variants first used on opening.
        const prepare = (p: number) => {
          const motion = foldChoreography(p)
          model!.setFold(motion.hinge, motion.angle)
          model!.body.rotation.set(-72 * p * Math.PI / 180, 0, (90 * (1 - p)) * Math.PI / 180)
          model!.body.updateMatrixWorld(true)
          miniature?.update(p)
          for (const material of [model!.screen, model!.cover]) {
            material.uniforms.progress.value = p
            material.uniforms.bodyInverse.value.copy(model!.displayFrame.matrixWorld).invert()
          }
        }
        // Visible terrain without the lantern primes the early shadow variants;
        // fully open primes the lit reflections. Intermediate poses reuse them.
        for (const p of [.12, 1]) {
          // Give input and photo frames a turn between preparation passes.
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
          if (disposed || loadedScene.current !== sceneId) return
          prepare(p)
          let compiled: Promise<unknown>
          try { compiled = renderer.compileAsync(scene, camera) }
          finally { update() }
          await compiled
          if (disposed || loadedScene.current !== sceneId) return
          prepare(p)
          try {
            renderer.render(scene, camera)
          } finally {
            // Restore and redraw synchronously before the browser can present
            // a frame: the user only sees the closed pose during preparation.
            update()
            renderer.render(scene, camera)
          }
        }
        element.dataset.warmupMs = (performance.now() - started).toFixed(0)
        renderPeak = 0; renderStalls = 0
        element.dataset.warmupPrograms = String(renderer.info.programs?.length)
      }
      surface.current = { scene, model, renderer, camera, draw: render, warmup, diorama: miniature }
      resize()
      update()
      setReady(true)
      setStatusKey('')
    }).catch(() => { if (!disposed) setStatusKey('model') })
    return () => {
      disposed = true
      cancelAnimationFrame(drawFrame)
      unsubscribe()
      observer.disconnect()
      const miniature = surface.current?.diorama
      surface.current = undefined
      const release = () => {
        miniature?.dispose()
        model?.dispose()
        environmentMap.dispose()
        key.shadow.map?.dispose()
        renderer.dispose()
      }
      // compileAsync still reads material properties while its GPU jobs finish.
      // Stop frames immediately, then release resources after that reader exits.
      if (preparation.current) void preparation.current.catch(() => {}).finally(release)
      else release()
    }
  }, [modelSrc, progress, diorama])
  useEffect(() => {
    if (!diorama || !ready || !sceneMotion || reducedMotion) return
    let frame = 0, last = performance.now()
    const animate = (time: number) => {
      const seconds = Math.min(.05, (time - last) / 1000)
      last = time
      if (!document.hidden && progress.get() > .014) {
        sceneTime.current += seconds
        surface.current?.diorama?.update(progress.get(), sceneTime.current, true)
        surface.current?.draw()
      }
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [diorama, ready, sceneMotion, reducedMotion, progress])
  useEffect(() => {
    if (!ready || !surface.current || videoSrc) return
    const current = surface.current
    let cancelled = false
    const textures: Texture[] = []
    const loader = new TextureLoader()
    Promise.all([screenSrc, coverSrc].map(src => loader.loadAsync(src).then(texture => {
      texture.flipY = false
      texture.colorSpace = SRGBColorSpace
      texture.anisotropy = Math.min(8, current.renderer.capabilities.getMaxAnisotropy())
      if (cancelled) texture.dispose()
      else textures.push(texture)
      return texture
    }))).then(([screen, cover]) => {
      if (cancelled) return
      current.model.screen.uniforms.screenMap.value = screen
      current.model.screen.uniforms.resolution.value.set(screen.image.width, screen.image.height)
      current.model.cover.uniforms.screenMap.value = cover
      current.model.cover.uniforms.resolution.value.set(cover.image.width, cover.image.height)
      current.model.screen.needsUpdate = true
      current.model.cover.needsUpdate = true
      current.draw()
      setEntered(true)
      setStatusKey('')
    }).catch(() => { if (!cancelled) setStatusKey('screen') })
    return () => { cancelled = true; for (const texture of textures) texture.dispose() }
  }, [screenSrc, coverSrc, videoSrc, ready])
  useEffect(() => {
    if (!ready || !surface.current || !videoSrc) return
    const current = surface.current
    const video = document.createElement('video')
    video.muted = true
    video.loop = true
    video.playsInline = true
    video.preload = 'auto'
    const texture = new VideoTexture(video)
    texture.flipY = false
    texture.colorSpace = SRGBColorSpace
    texture.generateMipmaps = true
    texture.minFilter = LinearMipmapLinearFilter
    videoElement.current = video
    let frame = 0
    let disposed = false
    const render = () => {
      if (disposed) return
      if (video.readyState >= 2) {
        for (const material of [current.model.screen, current.model.cover]) {
          material.uniforms.screenMap.value = texture
          material.uniforms.resolution.value.set(video.videoWidth, video.videoHeight)
        }
        current.draw()
      }
      frame = requestAnimationFrame(render)
    }
    video.onloadeddata = () => {
      if (disposed) return
      setStatusKey('')
      render()
      setEntered(true)
      if (videoPlaying) video.play().catch(() => setStatusKey('videoPlay'))
    }
    video.onerror = () => { if (!disposed) setStatusKey('video') }
    video.src = videoSrc
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      video.pause()
      video.removeAttribute('src')
      video.load()
      texture.dispose()
      if (videoElement.current === video) videoElement.current = null
    }
  }, [videoSrc, ready])
  useEffect(() => {
    const video = videoElement.current
    if (!video) return
    if (videoPlaying) video.play().then(() => setStatusKey('')).catch(() => setStatusKey('videoPlay'))
    else video.pause()
  }, [videoPlaying, videoSrc, ready])
  useEffect(() => {
    if (!ready || !surface.current) return
    const current = surface.current
    let cancelled = false
    const textures: Texture[] = []
    for (const [src, material, map, enabled] of [[screenOverlaySrc, current.model.screen, 'overlayMap', 'hasOverlay'], [coverOverlaySrc, current.model.cover, 'overlayMap', 'hasOverlay'], [revealSrc, current.model.screen, 'revealMap', 'hasReveal']] as const) {
      material.uniforms[enabled].value = 0
      if (!src) continue
      const texturePromise = src.endsWith('.json')
        ? createScreenContentTexture(
            src,
            Math.min(8, current.renderer.capabilities.getMaxAnisotropy()),
            current.renderer.capabilities.maxTextureSize,
            quarterTurnLayout,
            screenLayoutVariant,
          )
        : new TextureLoader().loadAsync(src)
      texturePromise.then(texture => {
        if (cancelled) { texture.dispose(); return }
        texture.flipY = false
        texture.colorSpace = SRGBColorSpace
        textures.push(texture)
        material.uniforms[map].value = texture
        material.uniforms[enabled].value = 1
        if (map === 'overlayMap' && texture.image) {
          material.uniforms.contentAspect.value = texture.image.width / Math.max(texture.image.height, 1)
        }
        if (texture.image instanceof HTMLCanvasElement && canvas.current?.parentElement) {
          const key = material === current.model.screen ? 'screenContentResolution' : 'coverContentResolution'
          canvas.current.parentElement.dataset[key] = `${texture.image.width}x${texture.image.height}`
        }
        current.draw()
      }).catch(() => { if (!cancelled) setStatusKey('content') })
    }
    current.draw()
    return () => { cancelled = true; textures.forEach(texture => texture.dispose()) }
  }, [screenOverlaySrc, coverOverlaySrc, revealSrc, ready, quarterTurnLayout, screenLayoutVariant])
  useEffect(() => {
    if (!ready || !surface.current || !depthSrc) return
    const current = surface.current
    let cancelled = false
    let texture: Texture | undefined
    new TextureLoader().loadAsync(depthSrc).then(loaded => {
      if (cancelled) { loaded.dispose(); return }
      texture = loaded
      loaded.flipY = false
      for (const material of [current.model.screen, current.model.cover]) {
        material.uniforms.depthMap.value = loaded
        material.uniforms.hasDepth.value = depthEnabled ? 1 : 0
        material.needsUpdate = true
      }
      update()
    }).catch(() => { if (!cancelled) setStatusKey('depth') })
    return () => { cancelled = true; texture?.dispose() }
  }, [depthSrc, depthEnabled, ready])
  return <div {...props} className={`duo-device ${className}`} data-progress={amount.toFixed(3)} data-finish={finish} data-zoom={zoom.toFixed(3)} data-zoom-scale={zoomScale.toFixed(2)} data-pivot-center={surface.current?.model.pivotCenter?.toArray().map(value => value.toFixed(4)).join(',') ?? 'loading'} data-screen-orientation={screenOrientation.toFixed(4)} data-video-wallpaper={Boolean(videoSrc)} data-video-playing={Boolean(videoSrc && videoPlaying)} data-rotation-z={rotationZ.toFixed(3)} data-ready={ready} data-entered={entered} data-model-source={surface.current?.model.sourceKind ?? 'loading'} data-home-scale={homeScale.toFixed(5)} data-interaction={browsePhotos ? 'photographs' : dragToRotate ? 'rotate' : 'fold'} data-rotation-x={rotationX.toFixed(3)} data-rotation-y={rotation.toFixed(3)} data-fold-projection={foldProjection} data-screen-overlay={Boolean(screenOverlaySrc)} data-cover-overlay={Boolean(coverOverlaySrc)} data-reveal-layer={Boolean(revealSrc)} data-depth-wallpaper={Boolean(depthSrc && depthEnabled)}
  >
    <canvas ref={canvas} aria-hidden="true" />
    <button ref={interactionTarget} className="duo-device-target" type="button" aria-label={dragToRotate ? DEVICE_STATUS_COPY[language].rotate : DEVICE_STATUS_COPY[language].fold} aria-pressed={dragToRotate ? undefined : amount >= 0.5} disabled={!ready}
      onPointerDown={event => {
        if (event.button !== 0 || points.current.size >= 2) return
        if (!points.current.size) cancelDynamics()
        points.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
        event.currentTarget.setPointerCapture(event.pointerId)
        if (points.current.size === 2) {
          const [a, b] = [...points.current.values()]
          pinch.current = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: liveView.current.zoom }
          drag.current = undefined
          suppressClick.current = true
          return
        }
        drag.current = dragToRotate
          ? { mode: 'rotate', x: event.clientX, y: event.clientY, rotation: { ...liveView.current.rotation }, moved: false, lastX: event.clientX, lastY: event.clientY, lastTime: performance.now(), vx: 0, vy: 0 }
          : { mode: 'fold', x: event.clientX, value: progress.get(), moved: false }
      }}
      onPointerMove={event => {
        const rect = event.currentTarget.getBoundingClientRect()
        depthPointer.current.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -(((event.clientY - rect.top) / rect.height) * 2 - 1))
        if (points.current.has(event.pointerId)) points.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (pinch.current && points.current.size === 2) {
          const [a, b] = [...points.current.values()]
          requestZoom(pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.distance)
          return
        }
        const start = drag.current
        if (!start) { if (depthEnabled && !diorama) update(); return }
        if (start.mode === 'rotate') {
          const dx = event.clientX - start.x, dy = event.clientY - start.y
          if (Math.hypot(dx, dy) < 3 && !start.moved) return
          if (!start.moved) onRotationStart?.()
          const now = performance.now(), seconds = Math.max(.008, (now - start.lastTime) / 1000)
          start.vx = start.vx * .35 + rotationDelta(event.clientX - start.lastX, rect.width) / seconds * .65
          start.vy = start.vy * .35 + rotationDelta(event.clientY - start.lastY, rect.width) / seconds * .65
          start.lastX = event.clientX; start.lastY = event.clientY; start.lastTime = now; start.moved = true
          const next = sceneOrbit ? { ...start.rotation, z: start.rotation.z - rotationDelta(dx, rect.width) } : {
            x: Math.max(-72, Math.min(72, start.rotation.x + rotationDelta(dy, rect.width))),
            y: start.rotation.y + rotationDelta(dx, rect.width), z: start.rotation.z,
          }
          liveView.current.rotation = next
          onRotationChange?.(next)
          return
        }
        const delta = start.x - event.clientX
        if (Math.abs(delta) < 5 && !start.moved) return
        start.moved = true
        setValue(start.value + delta / (event.currentTarget.clientWidth * .5))
      }}
      onPointerUp={event => {
        if (!points.current.has(event.pointerId)) return
        points.current.delete(event.pointerId)
        const start = drag.current
        suppressClick.current = start?.moved ?? Boolean(pinch.current)
        drag.current = undefined
        if (points.current.size) {
          const point = [...points.current.values()][0]
          pinch.current = undefined
          drag.current = { mode: 'rotate', x: point.x, y: point.y, rotation: { ...liveView.current.rotation }, moved: false, lastX: point.x, lastY: point.y, lastTime: performance.now(), vx: 0, vy: 0 }
        } else { pinch.current = undefined; finishRotation(start) }
      }}
      onPointerCancel={event => {
        if (!points.current.has(event.pointerId)) return
        points.current.clear(); pinch.current = undefined; drag.current = undefined
        cancelDynamics(); onRotationEnd?.(); suppressClick.current = true
      }}
      onLostPointerCapture={event => {
        if (!points.current.has(event.pointerId)) return
        points.current.clear(); pinch.current = undefined; drag.current = undefined
        cancelDynamics(); onRotationEnd?.(); suppressClick.current = true
      }}
      onClick={event => { if (!dragToRotate && !suppressClick.current) toggle(event.detail === 0); suppressClick.current = false }}
      onWheel={event => {
        if (!onZoomChange || browsePhotos || homeWheel) return
        cancelAnimationFrame(inertiaFrame.current); inertiaFrame.current = 0
        requestZoom((zoomFrame.current ? zoomTarget.current : liveView.current.zoom) * Math.exp(-normalizeWheel(event.deltaY, event.deltaMode, event.currentTarget.clientHeight) * .0016))
        onRotationEnd?.()
      }}
      onKeyDown={event => {
        if (!dragToRotate) return
        const step = event.shiftKey ? 15 : 5
        const delta = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        if (delta || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault(); cancelDynamics(); onRotationStart?.()
          const current = liveView.current.rotation
          const next = sceneOrbit ? { ...current, z: current.z - delta } : { ...current, y: current.y + delta, x: Math.max(-72, Math.min(72, current.x + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0))) }
          liveView.current.rotation = next; onRotationChange?.(next); onRotationEnd?.()
        } else if (['+', '=', '-', '_'].includes(event.key)) {
          cancelAnimationFrame(inertiaFrame.current); inertiaFrame.current = 0
          event.preventDefault(); requestZoom(liveView.current.zoom * (['+', '='].includes(event.key) ? 1.1 : 1 / 1.1)); onRotationEnd?.()
        }
      }}
    />
    {status && <p className="duo-status" role="status">{status}</p>}
  </div>
}
