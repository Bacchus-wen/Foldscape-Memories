import test from 'node:test'
import assert from 'node:assert/strict'
import { Euler, Quaternion, MathUtils } from 'three'
import { getMemoryPresentation, getPhotoRetraction, MEMORY_PRESENTATION_DURATION, MEMORY_MAX_ZOOM, MEMORY_ORBIT_DELAY } from '../src/iphone-duo/diorama/memory-presentation.ts'
import { progressToOpeningAngle } from '../src/iphone-duo/fold-choreography.ts'

test('presentation starts on a closed front-facing photograph before revealing the scene', () => {
  assert.equal(MEMORY_PRESENTATION_DURATION, 4320, 'opening and rewind take 80% of 5400ms');
  const start = getMemoryPresentation(0)
  assert.equal(start.fold, 0)
  assert.deepEqual(start.rotation, { x: 0, y: 0, z: 90 })
  assert.equal(start.done, false)
  assert.deepEqual(getMemoryPresentation(-100), start)
  assert.equal(getMemoryPresentation(300).fold, 0)
})

test('surrounding photographs retract continuously before the phone unfolds', () => {
  assert.equal(getPhotoRetraction(0), 0);
  assert.equal(getPhotoRetraction(160), .5);
  assert.equal(getPhotoRetraction(320), 1);
  const frames = [];
  for (let time = 0; time <= 320; time += 16) {
    assert.equal(getMemoryPresentation(time).fold, 0);
    frames.push(getPhotoRetraction(time));
  }
  for (let i = 1; i < frames.length; i++) assert.ok(frames[i] - frames[i - 1] < .08);
  for (let time = MEMORY_PRESENTATION_DURATION; time >= 320; time -= 16) assert.equal(getPhotoRetraction(time), 1);
});

test('opening and camera move together continuously without overshooting or looping', () => {
  let previous = getMemoryPresentation(0)
  for (let time = 16; time <= MEMORY_PRESENTATION_DURATION + 3000; time += 16) {
    const current = getMemoryPresentation(time)
    assert.ok(current.fold >= previous.fold && current.fold <= 1)
    assert.ok(current.rotation.x <= previous.rotation.x && current.rotation.x >= -72)
    assert.ok(current.fold - previous.fold < .02)
    assert.ok(Math.abs(current.rotation.x - previous.rotation.x) < 1)
    assert.ok(Math.abs(current.zoom - previous.zoom) < .01)
    previous = current
  }
  const middle = getMemoryPresentation(MEMORY_PRESENTATION_DURATION / 2)
  assert.ok(middle.fold > .1 && middle.fold < .9)
  assert.ok(middle.rotation.x < -10 && middle.rotation.x > -65)
})

test('the final view is fully open, front-facing and held indefinitely', () => {
  const end = getMemoryPresentation(MEMORY_PRESENTATION_DURATION)
  assert.equal(end.done, true)
  assert.equal(progressToOpeningAngle(end.fold), 180)
  assert.deepEqual(end.rotation, { x: -72, y: 0, z: 0 })
  assert.equal(end.zoom, 1.55 * 1.2)
  assert.equal(end.zoom, MEMORY_MAX_ZOOM)
  assert.equal(MEMORY_ORBIT_DELAY, 500)
  assert.deepEqual(getMemoryPresentation(MEMORY_PRESENTATION_DURATION + 60000), end)
})

test('rewinding starts at the inspected view and continuously returns to the closed photograph', () => {
  const inspected = { rotation: { x: -72, y: 0, z: -135 }, zoom: 1.37 }
  let previous = getMemoryPresentation(MEMORY_PRESENTATION_DURATION, inspected)
  const quaternion = rotation => new Quaternion().setFromEuler(new Euler(...[rotation.x, rotation.y, rotation.z].map(MathUtils.degToRad)))
  assert.ok(quaternion(previous.rotation).angleTo(quaternion(inspected.rotation)) < 1e-7)
  assert.equal(previous.zoom, inspected.zoom)
  for (let time = MEMORY_PRESENTATION_DURATION - 16; time >= 0; time -= 16) {
    const current = getMemoryPresentation(time, inspected)
    assert.ok(current.fold <= previous.fold && current.fold >= 0)
    assert.ok(Math.abs(current.rotation.z - previous.rotation.z) < 1.25, '80% duration allows 1.25x the former angular speed')
    assert.ok(Math.abs(current.zoom - previous.zoom) < .005)
    previous = current
  }
  assert.deepEqual(getMemoryPresentation(0, inspected), getMemoryPresentation(0))
})

test('rewinding after several full turns takes the shortest route without extra spins', () => {
  const inspected = { rotation: { x: -72, y: 0, z: 795 }, zoom: 1.18 }
  const start = getMemoryPresentation(MEMORY_PRESENTATION_DURATION, inspected)
  assert.equal(start.rotation.z, 75) // Same visible orientation as 795°.
  const middle = getMemoryPresentation(2700, inspected)
  assert.ok(middle.rotation.z > 75 && middle.rotation.z < 90)
  assert.deepEqual(getMemoryPresentation(-100, inspected).rotation, { x: 0, y: 0, z: 90 })
})

test('playing from an arbitrary pose returns smoothly before opening the photograph', () => {
  const start = { fold: .68, rotation: { x: 32, y: 735, z: -48 }, zoom: 1.45, orientation: Math.PI / 2 }
  const first = getMemoryPresentation(-1100, undefined, start)
  assert.deepEqual(first, { ...start, done: false })
  const quaternion = rotation => new Quaternion().setFromEuler(new Euler(...[rotation.x, rotation.y, rotation.z].map(MathUtils.degToRad)))
  let previous = first
  for (let time = -1084; time <= 0; time += 16) {
    const frame = getMemoryPresentation(time, undefined, start)
    assert.ok(frame.fold <= previous.fold && frame.fold >= 0)
    assert.ok(previous.fold - frame.fold < .03)
    assert.ok(quaternion(frame.rotation).angleTo(quaternion(previous.rotation)) < .07)
    assert.ok(Math.abs(frame.zoom - previous.zoom) < .02)
    assert.ok(frame.orientation <= previous.orientation && frame.orientation >= 0)
    assert.equal(frame.done, false)
    previous = frame
  }
  assert.deepEqual(getMemoryPresentation(0, undefined, start), getMemoryPresentation(0))
  assert.deepEqual(getMemoryPresentation(300, undefined, start), getMemoryPresentation(0))
  assert.ok(getMemoryPresentation(1000, undefined, start).fold > 0)
})

test('returning from a closed but rotated and zoomed view keeps the phone closed until reveal', () => {
  const start = { fold: 0, rotation: { x: -40, y: -375, z: 90 }, zoom: .72, orientation: 0 }
  assert.deepEqual(getMemoryPresentation(-1100, undefined, start), { ...start, done: false })
  const halfway = getMemoryPresentation(-550, undefined, start)
  assert.equal(halfway.fold, 0)
  assert.ok(halfway.zoom > start.zoom && halfway.zoom < getMemoryPresentation(0).zoom)
  assert.deepEqual(getMemoryPresentation(0, undefined, start), getMemoryPresentation(0))
})

test('landscape cover rolls continuously into the open landscape scene and returns to the same cover', () => {
  const quaternion = rotation => new Quaternion().setFromEuler(new Euler(...[rotation.x, rotation.y, rotation.z].map(MathUtils.degToRad)))
  let previous = getMemoryPresentation(0)
  assert.equal(previous.rotation.z, 90)
  for (let time = 16; time <= MEMORY_PRESENTATION_DURATION; time += 16) {
    const current = getMemoryPresentation(time)
    assert.ok(quaternion(current.rotation).angleTo(quaternion(previous.rotation)) < .02)
    assert.ok(current.rotation.z <= previous.rotation.z)
    previous = current
  }
  assert.deepEqual(getMemoryPresentation(MEMORY_PRESENTATION_DURATION).rotation, { x: -72, y: 0, z: 0 })
  const arbitrary = { fold: .6, rotation: { x: -30, y: 50, z: -90 }, zoom: 1.3, orientation: 0 }
  const returning = getMemoryPresentation(-.001, undefined, arbitrary)
  assert.ok(quaternion(returning.rotation).angleTo(quaternion(getMemoryPresentation(0).rotation)) < .00001)
})
