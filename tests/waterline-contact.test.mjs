import test from 'node:test'
import assert from 'node:assert/strict'
import {BoxGeometry,BufferGeometry,Float32BufferAttribute} from 'three'
import {extendToWaterline,groundWaterline} from '../src/iphone-duo/diorama/waterline-contact.ts'

test('separate floating solids each intersect water while retaining their shape and UVs',()=>{
  const ice=new BoxGeometry(1,.3,.6).translate(0,.2,.43)
  const floe=new BoxGeometry(.1,.1,.04).translate(.3,-.3,.13)
  const grounded=groundWaterline([ice,floe])
  for(const [i,g] of grounded.entries()){
    const source=[ice,floe][i];source.computeBoundingBox()
    assert.ok(g.boundingBox.min.z<.008)
    assert.ok(g.boundingBox.max.z>.008)
    assert.ok(Math.abs((g.boundingBox.max.z-g.boundingBox.min.z)-(source.boundingBox.max.z-source.boundingBox.min.z))<1e-6)
    assert.deepEqual(g.attributes.uv.array,source.attributes.uv.array)
  }
})

test('open ice and hull rims connect below the water without moving the original silhouette or UVs',()=>{
  const geometry=new BufferGeometry()
  geometry.setAttribute('position',new Float32BufferAttribute([-.2,0,.09, .2,0,.07, .2,0,.4, -.2,0,.4],3))
  geometry.setAttribute('uv',new Float32BufferAttribute([0,0,1,0,1,1,0,1],2))
  geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals()
  const result=extendToWaterline(geometry),p=result.attributes.position
  assert.ok(p.count>6,'the low open edge gets a contact wall')
  assert.equal(Math.min(...Array.from({length:p.count},(_,i)=>p.getZ(i))),Math.fround(.004))
  const original=geometry.toNonIndexed()
  for(let i=0;i<6;i++){
    assert.equal(p.getZ(i),original.attributes.position.getZ(i))
    assert.equal(result.attributes.uv.getX(i),original.attributes.uv.getX(i))
  }
})

test('closed geometry and tall architectural edges are not treated as waterline holes',()=>{
  const closed=new BoxGeometry(.3,.3,.05).translate(0,0,.06)
  const result=extendToWaterline(closed)
  assert.equal(result.attributes.position.count,closed.index.count,'UV seams are welded for boundary detection')
})
