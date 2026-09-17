import assert from 'node:assert/strict'
import test from 'node:test'
import {Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3} from 'three'
import {loadPhoneFixture} from './helpers/phone-fixture.mjs'
import {fillRearPanelOpenings} from '../src/iphone-duo/rear-panel.ts'

test('white rear panel covers the logo-shaped opening with matching panel surfaces',async()=>{
  const {source,fold}=await loadPhoneFixture()
  const overlay=source.scene.getObjectByName('LDcHeENovRXWVxD')
  fillRearPanelOpenings(source.scene)
  assert.equal(overlay.visible,false)
  assert.equal(source.scene.getObjectByName('ZEAwVPmUDdMbViq').visible,false)
  const fills=[];source.scene.traverse(o=>{if(o.name.startsWith('rear-panel-fill-'))fills.push(o)})
  assert.equal(fills.length,2)
  for(const fill of fills){
    const panel=source.scene.getObjectByName(fill.name.slice('rear-panel-fill-'.length))
    assert.equal(fill.material,panel.material)
    assert.equal(fill.skeleton,overlay.skeleton)
    assert.ok(fill.geometry.attributes.uv1,'backplate detail texture needs its own mapped UV channel')
    const probe=new Mesh(fill.geometry,new MeshBasicMaterial({side:DoubleSide}))
    const hits=new Raycaster(new Vector3(4.1,-2,0),new Vector3(0,1,0)).intersectObject(probe)
    assert.ok(hits.length>0,'no deeper differently shaded plate is exposed at the center of the old logo')
    assert.ok(Math.abs(hits[0].point.y+.2767)<.001,'fill remains flush with the surrounding backplate')
    probe.material.dispose()
  }
  for(const p of[0,.5,1,0]){fold(p);assert.ok(fills.every(m=>m.visible));assert.equal(overlay.visible,false)}
  fills.forEach(m=>m.geometry.dispose())
})
