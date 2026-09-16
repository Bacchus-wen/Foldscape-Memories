import test from 'node:test'
import assert from 'node:assert/strict'
import { getPopUpState, getRigidSceneRise } from '../src/iphone-duo/diorama/pop-up-motion.ts'

test('continuous architectural clusters stay stored until the phone is nearly flat', () => {
  assert.equal(getRigidSceneRise(.88), 0)
  assert.equal(getRigidSceneRise(1), 1)
  const middle = getRigidSceneRise(.95)
  assert.ok(middle > 0 && middle < 1)
  getRigidSceneRise(1)
  assert.equal(getRigidSceneRise(.95), middle, 'rewind uses the same rise path')
})

test('closed scene is stored; open scene has all layers raised', () => {
  assert.deepEqual(getPopUpState(0), { terrain: 0, cabins: 0, lighthouse: 0 })
  assert.deepEqual(getPopUpState(1), { terrain: 1, cabins: 1, lighthouse: 1 })
})
test('all layers move continuously forward as the phone opens', () => {
  let previous = getPopUpState(0)
  for (let i = 1; i <= 1000; i++) {
    const current = getPopUpState(i / 1000)
    for (const key of Object.keys(current)) {
      assert.ok(current[key] >= previous[key] && current[key] <= 1)
      assert.ok(current[key] - previous[key] < .02)
    }
    previous = current
  }
})
test('reversing and out-of-range input cannot leave stale animation state', () => {
  const middle = getPopUpState(.45)
  getPopUpState(1); getPopUpState(0)
  assert.deepEqual(getPopUpState(.45), middle)
  assert.deepEqual(getPopUpState(-1), getPopUpState(0))
  assert.deepEqual(getPopUpState(2), getPopUpState(1))
})
