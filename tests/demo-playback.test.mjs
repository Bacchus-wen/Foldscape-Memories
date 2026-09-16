import test from 'node:test'
import assert from 'node:assert/strict'
import { JSAnimation } from 'motion-dom'
import { getDemoLoop } from '../src/iphone-duo/diorama/demo-playback.ts'

test('automatic loop stays continuous at repeat boundaries after the lead-in', () => {
  const sequence = getDemoLoop()
  const playback = new JSAnimation({ ...sequence, duration:sequence.duration*1000, autoplay:false })
  try {
    const before = playback.sample(13999).value
    const after = playback.sample(14001).value
    assert.ok(Math.abs(before-after) < .005, `loop jumps from ${before} to ${after}`)
  } finally { playback.stop() }
})
