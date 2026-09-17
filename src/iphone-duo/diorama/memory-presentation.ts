import { Euler, Quaternion, MathUtils } from 'three'

export const MEMORY_CLOSED_POSE = {
  id: 'closed', fold: 0, orientation: 0,
  rotation: { x: 0, y: 0, z: 90 }, zoom: .991875,
}

export const MEMORY_MAX_ZOOM = 1.55 * 1.2
export const MEMORY_ORBIT_DELAY = 500

export const MEMORY_SCENE_POSE = {
  id: 'scene', fold: 1, orientation: 0,
  rotation: { x: -72, y: 0, z: 0 }, zoom: MEMORY_MAX_ZOOM,
}

export const MEMORY_PRESENTATION_DURATION = 4320
export const MEMORY_RETURN_DURATION = 1100
const PHOTO_HOLD = 320

// Share the opening clock: photos enter the cover before the hinge moves;
// rewinding releases them along exactly the same path.
export function getPhotoRetraction(elapsedMs: number) {
  return MathUtils.smoothstep(elapsedMs, 0, PHOTO_HOLD)
}
type MemoryView = Pick<typeof MEMORY_CLOSED_POSE, 'fold' | 'rotation' | 'zoom' | 'orientation'>

// Read the same clock backwards to rewind from the user's inspected scene view.
export function getMemoryPresentation(elapsedMs: number, sceneView: Pick<typeof MEMORY_SCENE_POSE, 'rotation' | 'zoom'> = MEMORY_SCENE_POSE, startView?: MemoryView) {
  // Negative time is a pausable return from the actual pose, before the photo hold.
  if (elapsedMs < 0 && startView) {
    const t = Math.max(0, (elapsedMs + MEMORY_RETURN_DURATION) / MEMORY_RETURN_DURATION)
    if (t === 0) return { ...startView, done: false }
    const eased = t * t * (3 - 2 * t)
    const startRotation = new Quaternion().setFromEuler(new Euler(...[startView.rotation.x, startView.rotation.y, startView.rotation.z].map(MathUtils.degToRad)))
    const closedRotation = new Quaternion().setFromEuler(new Euler(...[MEMORY_CLOSED_POSE.rotation.x, MEMORY_CLOSED_POSE.rotation.y, MEMORY_CLOSED_POSE.rotation.z].map(MathUtils.degToRad)))
    const rotation = new Euler().setFromQuaternion(startRotation.slerp(closedRotation, eased))
    const mix = (start: number, end: number) => start + (end - start) * eased
    return {
      fold: mix(startView.fold, MEMORY_CLOSED_POSE.fold),
      rotation: { x: MathUtils.radToDeg(rotation.x), y: MathUtils.radToDeg(rotation.y), z: MathUtils.radToDeg(rotation.z) },
      zoom: mix(startView.zoom, MEMORY_CLOSED_POSE.zoom),
      orientation: mix(startView.orientation, MEMORY_CLOSED_POSE.orientation),
      done: false,
    }
  }
  const t = Math.max(0, Math.min(1, (elapsedMs - PHOTO_HOLD) / (MEMORY_PRESENTATION_DURATION - PHOTO_HOLD)))
  const eased = t * t * t * (t * (t * 6 - 15) + 10)
  const mix = (start: number, end: number) => t === 1 ? end : start + (end - start) * eased
  const angle = (degrees: number) => ((degrees + 180) % 360 + 360) % 360 - 180
  const mixAngle = (start: number, end: number) => mix(start, start + angle(end - start))
  return {
    fold: mix(MEMORY_CLOSED_POSE.fold, MEMORY_SCENE_POSE.fold),
    rotation: { x: mixAngle(MEMORY_CLOSED_POSE.rotation.x, sceneView.rotation.x), y: mixAngle(MEMORY_CLOSED_POSE.rotation.y, sceneView.rotation.y), z: mixAngle(MEMORY_CLOSED_POSE.rotation.z, sceneView.rotation.z) },
    zoom: mix(MEMORY_CLOSED_POSE.zoom, sceneView.zoom),
    orientation: 0,
    done: t === 1,
  }
}
