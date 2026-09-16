import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeWheel, rotationDelta, damp, releaseStep } from '../src/iphone-duo/gesture-motion.ts'

test('gesture travel is consistent across screen sizes and wheel event modes', () => {
  assert.equal(rotationDelta(100, 400), rotationDelta(250, 1000))
  assert.equal(normalizeWheel(16, 0, 800), normalizeWheel(1, 1, 800))
  assert.equal(normalizeWheel(80, 0, 800), normalizeWheel(.1, 2, 800))
  assert.ok(Math.abs(normalizeWheel(100000, 0, 800)) <= 160)
})

test('zoom damping and release inertia are independent of frame rate', () => {
  const simulate = hz => {
    let zoom = .9, velocity = 90, angle = 0
    for (let i = 0; i < hz; i++) {
      zoom = damp(zoom, 1.4, 1 / hz)
      const step = releaseStep(velocity, 1 / hz)
      angle += step.distance
      velocity = step.velocity
    }
    return { zoom, velocity, angle }
  }
  const a = simulate(30), b = simulate(120)
  assert.ok(Math.abs(a.zoom - b.zoom) < 1e-6)
  assert.ok(Math.abs(a.angle - b.angle) < 1e-6)
  assert.ok(a.angle > 5 && a.angle < 20)
  assert.ok(a.velocity < .1)
  assert.ok(a.zoom <= 1.4)
})
