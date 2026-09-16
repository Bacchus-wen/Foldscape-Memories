import { gsap } from 'gsap'
import { getMemoryPresentation, MEMORY_PRESENTATION_DURATION, MEMORY_RETURN_DURATION } from './memory-presentation.ts'

// The sole clock for the memory sequence. Physical easing stays in the sampler.
export function createMemoryPlayback({ onFrame, onComplete }) {
  const clock = { elapsed: 0 }
  const context = gsap.context(() => {})
  let tween, direction = 1, startView, sceneView, disposed = false
  const render = () => onFrame({ ...getMemoryPresentation(clock.elapsed, sceneView, startView), elapsed: clock.elapsed, direction })
  return {
    play(options) {
      if (disposed) return
      context.revert()
      ;({ direction = 1, startView, sceneView } = options)
      clock.elapsed = Math.max(direction === 1 ? -MEMORY_RETURN_DURATION : 0, Math.min(MEMORY_PRESENTATION_DURATION, options.elapsed))
      const end = direction === 1 ? MEMORY_PRESENTATION_DURATION : 0
      render()
      context.add(() => {
        tween = gsap.to(clock, {
          elapsed: end, duration: Math.abs(end - clock.elapsed) / 1000, ease: 'none',
          onUpdate: render,
          onComplete: () => { tween = undefined; onComplete(direction) },
        })
      })
    },
    pause() { tween?.pause(); return clock.elapsed },
    seek(elapsed, view) {
      if (disposed) return
      context.revert()
      tween = undefined
      sceneView = view
      clock.elapsed = Math.max(0, Math.min(MEMORY_PRESENTATION_DURATION, elapsed))
      render()
    },
    dispose() { disposed = true; context.revert(); tween = undefined },
  }
}
