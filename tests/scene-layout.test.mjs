import test from 'node:test'
import assert from 'node:assert/strict'
import { Group } from 'three'
import { sceneEnvironment } from '../src/iphone-duo/diorama/scene-layout.ts'
import { createSceneEnvironment } from '../src/iphone-duo/diorama/scene-environment.ts'

test('land scenes have their own terrain and do not use full-screen ocean', () => {
  assert.equal(sceneEnvironment('lighthouse').kind, 'water')
  assert.equal(sceneEnvironment('iceberg').kind, 'ice')
  assert.equal(sceneEnvironment('coastal-house').kind, 'meadow')
  assert.equal(sceneEnvironment('santorini').kind, 'limestone')
  assert.equal(sceneEnvironment('osaka-castle').kind, 'garden')
})

test('dry environments contain no reflective ocean and every surface is hidden when closed', () => {
  for(const id of ['lighthouse','iceberg','coastal-house','santorini','osaka-castle']) {
    const left=new Group(),right=new Group(),environment=createSceneEnvironment(left,right,id,32)
    const mirrors=[]
    left.traverse(o=>{if(o.isReflector)mirrors.push(o)})
    if(id==='santorini'||id==='osaka-castle') assert.equal(mirrors.length,0)
    else assert.equal(mirrors.length,1)
    environment.update(0)
    assert.ok([...left.children,...right.children].every(o=>!o.visible))
    environment.update(.5)
    assert.ok([...left.children,...right.children].every(o=>o.visible))
    environment.dispose();environment.dispose()
    assert.equal(left.children.length+right.children.length,0)
  }
})
