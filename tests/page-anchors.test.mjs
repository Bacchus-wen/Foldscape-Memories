import test from 'node:test'
import assert from 'node:assert/strict'
import { Vector3 } from 'three'
import { loadPhoneFixture } from './helpers/phone-fixture.mjs'
import { createPageAnchors } from '../src/iphone-duo/diorama/page-anchors.ts'

test('actual open screen anchors sit at the independently measured half-screen centers', async () => {
  const { host, screen } = await loadPhoneFixture()
  const anchors = createPageAnchors(screen, host)
  anchors.update()
  for (const [group, expectedX] of [[anchors.left, -3.946], [anchors.right, 3.946]]) {
    const center = group.getWorldPosition(new Vector3())
    assert.ok(Math.abs(center.x - expectedX) < .04, `x ${center.x}`)
    assert.ok(Math.abs(center.y) < .03, `y ${center.y}`)
    assert.ok(Math.abs(center.z - .2693) < .03, `z ${center.z}`)
  }
})
test('left page normal reverses on closing and both anchors survive arbitrary scrubbing', async () => {
  const { host, screen, fold } = await loadPhoneFixture()
  const anchors = createPageAnchors(screen, host)
  anchors.update()
  const open = anchors.left.matrix.clone()
  fold(0); anchors.update()
  const leftNormal = new Vector3(0,0,1).transformDirection(anchors.left.matrixWorld)
  assert.ok(leftNormal.z < -.99)
  const rightNormal = new Vector3(0,0,1).transformDirection(anchors.right.matrixWorld)
  assert.ok(rightNormal.z > .99)
  for (const p of [.2,.9,.5,0,1]) { fold(p); anchors.update() }
  anchors.left.matrix.elements.forEach((value, i) => assert.ok(Math.abs(value-open.elements[i]) < .0001))
  const before = anchors.right.getWorldPosition(new Vector3())
  host.position.set(2,3,-1); host.updateMatrixWorld(true); anchors.update()
  const after = anchors.right.getWorldPosition(new Vector3())
  assert.ok(after.distanceTo(before.add(new Vector3(2,3,-1))) < .0001)
})

test('flat scene stays on the right screen plane throughout opening and rewind', async () => {
  const { host, screen, fold } = await loadPhoneFixture()
  const anchors = createPageAnchors(screen, host, true)
  anchors.update()
  const open = [anchors.left.matrix.clone(), anchors.right.matrix.clone()]
  for (const p of [0, .2, .6, 1, .6, .2, 0]) {
    fold(p); anchors.update()
    for (const [side, group] of [anchors.left, anchors.right].entries()) {
      group.matrix.elements.forEach((v, i) => assert.ok(Math.abs(v - open[side].elements[i]) < .0001))
    }
  }
  anchors.dispose()
})
