import test from 'node:test'
import assert from 'node:assert/strict'
import {Box3,BoxGeometry,Matrix4,Vector3} from 'three'
import {PAGE_CENTER,splitAtHinge,spreadFoldMatrix} from '../src/iphone-duo/diorama/spread-layout.ts'
import {createScreenGround} from '../src/iphone-duo/diorama/screen-ground.ts'
import {loadPhoneFixture} from './helpers/phone-fixture.mjs'

test('diagonal geometry clips on the exact shared edge without losing UV coordinates',()=>{
  const source=new BoxGeometry(1.8,1.05,.6).translate(0,0,.3)
  const transform=new Matrix4().makeRotationZ(.23)
  const halves=splitAtHinge(source,transform)
  assert.ok(Math.abs(halves[0].boundingBox.max.x-PAGE_CENTER)<1e-6)
  assert.ok(Math.abs(halves[1].boundingBox.min.x+PAGE_CENTER)<1e-6)
  for(const half of halves){assert.equal(half.attributes.uv.count,half.attributes.position.count);half.dispose()}
  source.dispose()
})

test('continuous ground follows the exact display vertices through the entire fold',async()=>{
  const {host,screen,fold}=await loadPhoneFixture()
  const ground=createScreenGround(screen,'santorini')
  assert.equal(ground.ground.geometry,screen.geometry)
  assert.equal(ground.ground.skeleton,screen.skeleton)
  const a=new Vector3(),b=new Vector3()
  for(const p of [0,.2,.5,.8,1,.5,0]){
    fold(p);host.updateMatrixWorld(true)
    for(let i=0;i<screen.geometry.attributes.position.count;i+=37){
      screen.getVertexPosition(i,a).applyMatrix4(screen.matrixWorld)
      ground.ground.getVertexPosition(i,b).applyMatrix4(ground.ground.matrixWorld)
      assert.ok(a.distanceTo(b)<1e-6,'no guessed edge offsets or separate inner corners')
    }
  }
  ground.dispose()
})

test('cross-hinge structures stay in their own opening wedge and return to the exact open geometry',()=>{
  for(const side of [0,1])for(const layer of ['terrain','cabins','lighthouse'])for(let i=0;i<=100;i++){
    const progress=i/100,matrix=spreadFoldMatrix(progress,side,layer)
    for(const x of [0,.05,.3,.8])for(const z of [0,.2,1.2]){
      const v=new Vector3((side?1:-1)*(x-PAGE_CENTER),0,z).applyMatrix4(matrix)
      const d=side?v.x+PAGE_CENTER:PAGE_CENTER-v.x
      if(i>0&&i<96&&matrix.elements[10]>.001)assert.ok(v.z<=d*Math.tan(Math.PI*progress/.96/2)+1e-5)
      if(i===100)assert.ok(v.distanceTo(new Vector3((side?1:-1)*(x-PAGE_CENTER),0,z))<1e-8)
    }
  }
})

test('structures clear of the hinge retain the original straight rise once safe',()=>{
  const safe=spreadFoldMatrix(.8,1,'lighthouse',.35,.8)
  assert.ok(Math.abs(safe.elements[8])<1e-8, 'no unnecessary sideways deformation of the lighthouse')
  for(const p of [.2,.4,.6]){
    const matrix=spreadFoldMatrix(p,1,'lighthouse',.2,.8)
    for(const d of [.2,.4])for(const height of [.2,.8]){
      const v=new Vector3(d-PAGE_CENTER,0,height).applyMatrix4(matrix)
      if(matrix.elements[10]>.001)assert.ok(v.z<=(v.x+PAGE_CENTER)*Math.tan(Math.PI*p/.96/2)+1e-5)
    }
  }
})
