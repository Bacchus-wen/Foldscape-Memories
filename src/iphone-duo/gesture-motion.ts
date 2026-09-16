export function normalizeWheel(delta: number, mode: number, pageHeight: number) {
  return Math.max(-160, Math.min(160, delta * (mode === 1 ? 16 : mode === 2 ? pageHeight : 1)))
}

export function rotationDelta(delta: number, width: number) {
  return delta / Math.max(1, width) * 150
}

export function damp(value: number, target: number, seconds: number) {
  return target + (value - target) * Math.exp(-Math.max(0, seconds) / .12)
}

export function releaseStep(velocity: number, seconds: number) {
  const decay = Math.exp(-Math.max(0, seconds) / .12)
  return { distance: velocity * .12 * (1 - decay), velocity: velocity * decay }
}
