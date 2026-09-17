import test from 'node:test'
import assert from 'node:assert/strict'
import { Group, Mesh, BoxGeometry, MeshStandardMaterial, Vector3, Float32BufferAttribute } from 'three'
import { loadPhoneFixture } from './helpers/phone-fixture.mjs'
import { createPageAnchors } from '../src/iphone-duo/diorama/page-anchors.ts'
import { createScreenPortal } from '../src/iphone-duo/diorama/screen-portal.ts'
import { createPortalCaps } from '../src/iphone-duo/diorama/portal-caps.ts'
import { Plane } from 'three'

test('screen portal preserves full-size geometry and isolates shared materials', () => {
  const host = new Group(), lid = new Group(), anchors = [new Group(),new Group()]
  host.add(lid,...anchors)
  const source = new MeshStandardMaterial()
  const pages = anchors.map(anchor=>{const page=new Group();page.add(new Mesh(new BoxGeometry(),source));anchor.add(page);return page})
  host.updateMatrixWorld(true)
  const portal=createScreenPortal(pages,anchors,lid)
  lid.rotation.y=Math.PI;host.updateMatrixWorld(true);portal.update(0)
  assert.ok(pages.every(page=>!page.visible))
  lid.rotation.y=0;host.updateMatrixWorld(true);portal.update(1)
  assert.ok(pages.every(page=>page.visible))
  assert.deepEqual(pages[0].children[0].scale.toArray(),[1,1,1])
  assert.equal(source.clippingPlanes,null)
  assert.notEqual(pages[0].children[0].material,pages[1].children[0].material)
  let disposed=0
  pages.forEach(page=>page.children[0].material.addEventListener('dispose',()=>disposed++))
  portal.dispose();assert.equal(disposed,2)
  pages.forEach(page=>page.children[0].geometry.dispose());source.dispose()
})

test('a revealed cross-hinge object cannot protrude through the moving screen', async () => {
  const { host, screen, fold } = await loadPhoneFixture()
  const screens = createPageAnchors(screen, host)
  const anchors = createPageAnchors(screen, host, true)
  screens.update(); anchors.update()
  const source = new MeshStandardMaterial()
  const pages = [anchors.left, anchors.right].map(anchor => {
    const page = new Group()
    page.add(new Mesh(new BoxGeometry(1, 1, 1), source))
    anchor.add(page)
    return page
  })
  const portal = createScreenPortal(pages, [anchors.left, anchors.right], screens.left)
  fold(.35); screens.update(); anchors.update(); portal.update(1)
  const center = screens.left.getWorldPosition(new Vector3())
  const normal = new Vector3(0, 0, 1).transformDirection(screens.left.matrixWorld)
  for (const page of pages) {
    const planes = page.children[0].material.clippingPlanes
    assert.equal(planes.length, 1, 'only the moving screen constrains visibility')
    assert.ok(planes[0].distanceToPoint(center.clone().addScaledVector(normal, -.1)) < 0, 'geometry behind the screen is clipped')
    assert.ok(planes[0].distanceToPoint(center.clone().addScaledVector(normal, .1)) > 0, 'geometry inside the open device remains visible')
  }
  fold(.65); screens.update(); anchors.update(); portal.update(.65)
  assert.equal(pages[0].visible, true)
  for (const p of [.12, .25, .4, .5, .58, .62, .8]) {
    fold(p); screens.update(); anchors.update(); portal.update(p)
    const leftPlanes=pages[0].children[0].material.clippingPlanes
    const rightPlanes=pages[1].children[0].material.clippingPlanes
    for(const z of [-.4,0,.2,.4]) {
      const point=new Vector3(0,0,z).applyMatrix4(anchors.right.matrixWorld)
      assert.equal(leftPlanes.every(plane=>plane.distanceToPoint(point)>=0),rightPlanes.every(plane=>plane.distanceToPoint(point)>=0),'partial reveal must agree on both sides of the hinge')
    }
  }
  fold(1); screens.update(); anchors.update(); portal.update(1)
  assert.ok(pages[1].children[0].material.clippingPlanes[0].distanceToPoint(new Vector3(0, 0, .5).applyMatrix4(anchors.right.matrixWorld)) > 0)
  portal.dispose(); screens.dispose(); anchors.dispose()
  pages.forEach(page => page.children[0].geometry.dispose()); source.dispose()
})

test('portal cuts have temporary solid caps instead of exposing an open shell', async () => {
  const { host, screen, fold } = await loadPhoneFixture()
  const screens = createPageAnchors(screen, host), anchors = createPageAnchors(screen, host, true)
  screens.update(); anchors.update()
  const source = new MeshStandardMaterial()
  const pages = [anchors.left, anchors.right].map(anchor => {
    const page = new Group(); page.add(new Mesh(new BoxGeometry(1, 1, 1), source)); anchor.add(page); return page
  })
  const portal = createScreenPortal(pages, [anchors.left, anchors.right], screens.left)
  fold(.5); screens.update(); anchors.update(); portal.update(.5)
  const caps = host.getObjectByName('screen-portal-caps')
  assert.ok(caps, 'clipping must supply cross-section surfaces, not just discard fragments')
  assert.equal(caps.visible, true)
  const surfaces=[]; caps.traverse(o=>{if(o.name==='portal-cut-face')surfaces.push(o)})
  assert.equal(surfaces.length, 1)
  for(const face of surfaces) {
    assert.equal(face.material.depthWrite, true)
    assert.ok(face.material.clippingPlanes.length===0)
  }
  assert.ok(surfaces.some(face=>face.geometry.attributes.position.count>0), 'actual cross-section triangles fill the cut')
  fold(1); screens.update(); anchors.update(); portal.update(1); assert.equal(caps.visible,false,'no extra cap passes when fully unfolded')
  fold(0); screens.update(); anchors.update(); portal.update(0); assert.equal(caps.visible,false)
  fold(.5); screens.update(); anchors.update(); portal.update(.5); assert.equal(caps.visible,true,'rewind uses the same solid cut')
  portal.dispose(); assert.equal(host.getObjectByName('screen-portal-caps'),undefined)
  screens.dispose();anchors.dispose();source.dispose();pages.forEach(p=>p.children[0].geometry.dispose())
})

test('a cut through an open-bottom box fills its interior without escaping its outline', () => {
  const host = new Group(), page = new Group(), box = new BoxGeometry().toNonIndexed()
  const position = box.attributes.position, kept = []
  for(let i=0;i<position.count;i+=3) {
    if([0,1,2].every(j=>position.getZ(i+j)===-.5)) continue
    for(let j=0;j<3;j++)kept.push(position.getX(i+j),position.getY(i+j),position.getZ(i+j))
  }
  box.setAttribute('position',new Float32BufferAttribute(kept,3));box.clearGroups()
  page.add(new Mesh(box,new MeshStandardMaterial()));host.add(page)
  const caps=createPortalCaps([page],host,[new Plane(new Vector3(0,0,1),0)],'#ffffff')
  caps.update(.5)
  const face=host.getObjectByName('portal-cut-face'), vertices=face.geometry.attributes.position
  let area=0
  const a=new Vector3(),b=new Vector3(),c=new Vector3()
  for(let i=0;i<face.geometry.drawRange.count;i+=3) {
    a.fromBufferAttribute(vertices,i);b.fromBufferAttribute(vertices,i+1);c.fromBufferAttribute(vertices,i+2)
    for(const p of [a,b,c]){assert.ok(Math.abs(p.x)<=.50001&&Math.abs(p.y)<=.50001);assert.ok(Math.abs(p.z)<1e-6)}
    area+=b.sub(a).cross(c.sub(a)).length()/2
  }
  assert.ok(Math.abs(area-1)<1e-5,'cross-section fills the square, not only its boundary triangles')
  const version=vertices.version
  caps.update(.6);assert.equal(vertices.version,version,'unchanged cut does not upload new geometry')
  caps.dispose();box.dispose();page.children[0].material.dispose()
})

test('released space depends on the lid angle, not an independent playback height', async () => {
  const {host,screen,fold}=await loadPhoneFixture()
  const screens=createPageAnchors(screen,host), anchors=createPageAnchors(screen,host,true)
  const source=new MeshStandardMaterial(), pages=[anchors.left,anchors.right].map(anchor=>{
    const page=new Group();page.add(new Mesh(new BoxGeometry(),source));anchor.add(page);return page
  })
  fold(.4);screens.update();anchors.update()
  const portal=createScreenPortal(pages,[anchors.left,anchors.right],screens.left)
  const snapshot=()=>pages[0].children[0].material.clippingPlanes.map(p=>[...p.normal.toArray(),p.constant])
  portal.update(.2);const before=snapshot()
  portal.update(.8);assert.deepEqual(snapshot(),before,'holding the lid fixed must hold the visible volume fixed')
  portal.dispose();screens.dispose();anchors.dispose();source.dispose();pages.forEach(p=>p.children[0].geometry.dispose())
})
