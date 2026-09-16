import assert from 'node:assert/strict'
import test from 'node:test'
import { foldChoreography, HINGE_PHASE, openingAngleToProgress, progressToOpeningAngle } from '../src/iphone-duo/fold-choreography.ts'

test('physical hinge endpoints and degree presets remain unchanged', () => {
  assert.equal(foldChoreography(0).hinge, 0)
  assert.equal(foldChoreography(HINGE_PHASE).hinge, 1)
  for (const angle of [0, 30, 60, 90, 135, 179, 180]) {
    assert.equal(progressToOpeningAngle(openingAngleToProgress(angle)), angle)
  }
})

test('both displays settle clear with no endpoint focus snap', () => {
  for (const key of ['innerDefocus', 'coverDefocus']) {
    assert.equal(foldChoreography(1)[key], 0)
    assert.ok(foldChoreography(0.9)[key] < 0.1, `${key} should recover before the final 4%`)
    assert.ok(foldChoreography(0.999)[key] < 0.00001, `${key} should arrive with zero slope`)
    assert.ok(foldChoreography(0.48)[key] > 0.9, `${key} should retain the strong half-fold effect`)
  }
  assert.ok(foldChoreography(0).coverFocusEdge > 1.2, 'closed cover stays in front of the blur wave')
})

test('focus fronts and radii are bounded and continuous during scrubbing', () => {
  let previous = foldChoreography(0)
  for (let frame = 1; frame <= 1000; frame++) {
    const current = foldChoreography(frame / 1000)
    for (const key of ['coverFocusEdge', 'innerFocusEdge', 'coverDefocus', 'innerDefocus']) {
      assert.ok(Number.isFinite(current[key]))
      if (key !== 'coverDefocus' || frame > 300) {
        assert.ok(current[key] <= previous[key] + 1e-12, `${key} must not reverse during focus recovery`)
      }
      assert.ok(Math.abs(current[key] - previous[key]) < 0.007, `${key} must not jump`)
    }
    for (const key of ['innerDefocus', 'coverDefocus']) assert.ok(current[key] >= 0 && current[key] <= 1)
    previous = current
  }
  assert.deepEqual(foldChoreography(-1), foldChoreography(0))
  assert.deepEqual(foldChoreography(2), foldChoreography(1))
})

test('cover is clear when closed and begins defocusing visibly around 10 degrees', () => {
  assert.equal(foldChoreography(0).coverDefocus, 0)
  const early = foldChoreography(openingAngleToProgress(10)).coverDefocus
  assert.ok(early > 0.03 && early < 0.1)
  assert.ok(foldChoreography(openingAngleToProgress(20)).coverDefocus > early)
  assert.ok(foldChoreography(openingAngleToProgress(60)).coverDefocus > 0.9)
  assert.equal(foldChoreography(1).coverDefocus, 0)
})

test('inner luminance rises smoothly and wallpaper drift settles without overshoot', () => {
  assert.equal(foldChoreography(1).innerBrightness, 1)
  assert.ok(foldChoreography(0.2).innerBrightness < 0.15)
  assert.ok(foldChoreography(0.8).innerBrightness > 0.9)
  assert.equal(Math.abs(foldChoreography(0).coverWallpaperShift), 0)
  assert.equal(Math.abs(foldChoreography(1).coverWallpaperShift), 0)
  assert.equal(foldChoreography(1).innerWallpaperShift, 0)
  let previous = foldChoreography(0)
  for (let frame = 1; frame <= 1000; frame++) {
    const current = foldChoreography(frame / 1000)
    assert.ok(current.innerBrightness >= previous.innerBrightness)
    assert.ok(current.innerBrightness <= 1)
    assert.ok(current.innerWallpaperShift >= 0 && current.innerWallpaperShift <= 0.022)
    assert.ok(Math.abs(current.coverWallpaperShift) <= 0.016)
    assert.ok(Math.abs(current.innerBrightness - previous.innerBrightness) < 0.003)
    for (const key of ['innerWallpaperShift', 'coverWallpaperShift']) {
      assert.ok(Math.abs(current[key] - previous[key]) < 0.0001)
    }
    previous = current
  }
})

test('foreground parallax is stronger on the inner screen and settles continuously', () => {
  assert.equal(foldChoreography(1).innerContentShift, 0)
  assert.equal(Math.abs(foldChoreography(0).coverContentShift), 0)
  assert.equal(Math.abs(foldChoreography(1).coverContentShift), 0)
  assert.ok(foldChoreography(0.32).innerContentShift > 0.03)
  let previous = foldChoreography(0).innerContentShift
  for (let frame = 1; frame <= 1000; frame++) {
    const { innerContentShift, coverContentShift } = foldChoreography(frame / 1000)
    assert.ok(innerContentShift >= 0 && innerContentShift <= previous)
    assert.ok(previous - innerContentShift < 0.0002)
    assert.ok(Math.abs(coverContentShift) <= 0.008)
    previous = innerContentShift
  }
})
