import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryPlayback } from '../src/iphone-duo/diorama/memory-playback.js'
import { MEMORY_PRESENTATION_DURATION } from '../src/iphone-duo/diorama/memory-presentation.ts'

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
test('one playback clock reaches both physical endpoints and can be interrupted', async () => {
  const frames = [], completed = []
  const player = createMemoryPlayback({ onFrame: frame => frames.push(frame), onComplete: direction => completed.push(direction) })
  try {
    player.play({ elapsed: MEMORY_PRESENTATION_DURATION - 40, direction: 1 })
    await wait(120)
    assert.deepEqual(completed, [1])
    assert.equal(frames.at(-1).fold, 1)
    player.play({ elapsed: 40, direction: -1 })
    await wait(120)
    assert.deepEqual(completed, [1, -1])
    assert.equal(frames.at(-1).fold, 0)
    player.play({ elapsed: 0, direction: 1 })
    const paused = player.pause()
    const count = frames.length
    await wait(80)
    assert.equal(frames.length, count)
    assert.ok(paused < 100)
    player.seek(2700)
    assert.equal(frames.at(-1).elapsed, 2700)
    assert.ok(frames.at(-1).fold > 0 && frames.at(-1).fold < 1)
  } finally { player.dispose() }
})

test('a return can pause and resume without forgetting its captured view', async () => {
  const startView = { fold: .75, rotation: { x: -40, y: 65, z: 15 }, zoom: 1.3, orientation: 0 }
  const frames = []
  const player = createMemoryPlayback({ onFrame: frame => frames.push(frame), onComplete: () => {} })
  player.play({ elapsed: -1100, direction: 1, startView })
  await wait(40)
  const paused = player.pause()
  const stopped = frames.at(-1)
  await wait(40)
  assert.equal(frames.at(-1), stopped)
  player.play({ elapsed: paused, direction: 1, startView })
  assert.ok(Math.abs(frames.at(-1).fold - stopped.fold) < .03)
  player.dispose()
  const count = frames.length
  await wait(40)
  assert.equal(frames.length, count)
})
