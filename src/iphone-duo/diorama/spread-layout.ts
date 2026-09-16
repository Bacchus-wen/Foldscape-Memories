import { Box3, BufferGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, PointLight, Vector3, type Object3D } from 'three'
import { foldChoreography } from '../fold-choreography.ts'
import { getPopUpState } from './pop-up-motion.ts'
import { extendToWaterline, groundWaterline } from './waterline-contact.ts'

export const PAGE_CENTER = .5 / .94
export const SPREAD_LAYOUTS: Record<string,{angle:number;width:number;depth:number}> = {
  lighthouse: {angle:-5,width:1.99,depth:1.37},
  iceberg: {angle:-9,width:1.98,depth:1.36},
  'coastal-house': {angle:-13,width:1.99,depth:1.39},
  santorini: {angle:-30,width:1.97,depth:1.39},
  'osaka-castle': {angle:-14,width:1.97,depth:1.39},
}

/** Bake each mesh and clip triangles exactly at the hinge, including interpolated UVs. */
export function splitAtHinge(source: BufferGeometry, transform: Matrix4, waterContact=false) {
  let geometry=source.clone().applyMatrix4(transform)
  if(waterContact){const repaired=extendToWaterline(geometry);geometry.dispose();geometry=repaired}
  const names=Object.keys(geometry.attributes),position=geometry.attributes.position
  const offsets:Record<string,number>={},sizes:Record<string,number>={}
  let stride=0
  for(const name of names){offsets[name]=stride;sizes[name]=geometry.attributes[name].itemSize;stride+=sizes[name]}
  const output=[[] as number[],[] as number[]]
  const vertex=(index:number)=>names.flatMap(name=>{
    const a=geometry.attributes[name];return Array.from({length:a.itemSize},(_,j)=>a.getComponent(index,j))
  })
  const count=geometry.index?.count??position.count,px=offsets.position
  for(let i=0;i<count;i+=3){
    const triangle=[0,1,2].map(j=>vertex(geometry.index?geometry.index.getX(i+j):i+j))
    for(let side=0;side<2;side++){
      const polygon:number[][]=[],sign=side?1:-1
      for(let j=0;j<3;j++){
        const a=triangle[j],b=triangle[(j+1)%3],insideA=a[px]*sign>=0,insideB=b[px]*sign>=0
        if(insideA)polygon.push(a)
        if(insideA!==insideB){const t=-a[px]/(b[px]-a[px]);polygon.push(a.map((v,k)=>v+(b[k]-v)*t))}
      }
      for(let j=1;j<polygon.length-1;j++)for(const v of [polygon[0],polygon[j],polygon[j+1]])output[side].push(...v)
    }
  }
  geometry.dispose()
  return output.map((values,side)=>{
    const result=new BufferGeometry()
    for(const name of names){
      const a:number[]=[],size=sizes[name],offset=offsets[name]
      for(let i=0;i<values.length;i+=stride)for(let j=0;j<size;j++)a.push(values[i+offset+j])
      result.setAttribute(name,new Float32BufferAttribute(a,size))
    }
    result.translate(side?-PAGE_CENTER:PAGE_CENTER,0,0)
    result.normalizeNormals();result.computeBoundingBox();result.computeBoundingSphere()
    return result
  })
}

/** Shear the rising cross-hinge sections outward until the two pages lie flat. */
export function spreadFoldMatrix(progress:number,side:number,layer:'terrain'|'cabins'|'lighthouse',clearance=0,height=1) {
  const rise=getPopUpState(progress)[layer],angle=foldChoreography(progress).hinge*Math.PI
  const shear=rise>0 && angle<Math.PI-1e-6 ? Math.max(0,rise/Math.tan(Math.max(.001,angle/2))*1.02-clearance/Math.max(.001,height)) : 0
  return new Matrix4().set(1,0,(side?1:-1)*shear,0, 0,1,0,0, 0,0,Math.max(.0001,rise),0, 0,0,0,1)
}

export function createSpreadLayout(nodes:Object3D[],id:string) {
  const layout=SPREAD_LAYOUTS[id]??SPREAD_LAYOUTS.lighthouse
  const authored=new Group(),oldLeft=new Group(),oldRight=new Group()
  oldLeft.position.x=-PAGE_CENTER;oldRight.position.x=PAGE_CENTER
  oldLeft.add(nodes[1],nodes[2],nodes[3]);oldRight.add(nodes[0],nodes[4]);authored.add(oldLeft,oldRight)
  authored.rotation.z=layout.angle*Math.PI/180;authored.updateMatrixWorld(true)
  const bounds=new Box3().setFromObject(authored,true),size=bounds.getSize(new Vector3())
  const scale=Math.min(layout.width/size.x,layout.depth/size.y)
  const center=bounds.getCenter(new Vector3())
  const placement=new Matrix4().makeScale(scale,scale,scale)
  placement.setPosition(-center.x*scale,-center.y*scale,.016-bounds.min.z*scale)
  const grounded=new Map<Mesh,BufferGeometry>()
  if(id==='iceberg'){
    const meshes:Mesh[]=[]
    const vessel=new Set<Object3D>();nodes[0].traverse(object=>vessel.add(object))
    authored.traverse(object=>{if(object instanceof Mesh)meshes.push(object)})
    const baked=meshes.map(mesh=>mesh.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(placement,mesh.matrixWorld)))
    groundWaterline(baked,.004,meshes.map(mesh=>vessel.has(mesh)?.002:.024)).forEach((geometry,i)=>grounded.set(meshes[i],geometry))
    baked.forEach(geometry=>geometry.dispose())
  }
  const left=new Group(),right=new Group(),pages=[left,right],geometries:BufferGeometry[]=[],lights:PointLight[]=[]
  const layers={terrain:[new Group(),new Group()],cabins:[new Group(),new Group()],lighthouse:[new Group(),new Group()]}
  for(const pair of Object.values(layers))pair.forEach((group,i)=>{group.matrixAutoUpdate=false;pages[i].add(group)})
  nodes.forEach((node,index)=>{
    const layer=index>=3?'terrain':index===0?'lighthouse':'cabins'
    node.traverse(object=>{
      const transform=new Matrix4().multiplyMatrices(placement,object.matrixWorld)
      if(object instanceof PointLight){
        const p=new Vector3().setFromMatrixPosition(transform),side=p.x>=0?1:0
        p.x+=side?-PAGE_CENTER:PAGE_CENTER
        const anchor=new Group();anchor.name='LanternLightAnchor';anchor.position.copy(p)
        const light=object.clone();lights.push(light);anchor.add(light);layers[layer][side].add(anchor)
      }
      if(!(object instanceof Mesh))return
      splitAtHinge(grounded.get(object)??object.geometry,grounded.has(object)?new Matrix4():transform,id==='iceberg').forEach((geometry,side)=>{
        geometries.push(geometry)
        if(!geometry.attributes.position.count)return
        const mesh=new Mesh(geometry,object.material)
        mesh.name=object.name;mesh.castShadow=object.castShadow;mesh.receiveShadow=object.receiveShadow
        layers[layer][side].add(mesh)
      })
    })
  })
  grounded.forEach(geometry=>geometry.dispose())
  for(const pair of Object.values(layers))pair.forEach((group,side)=>{
    const box=new Box3().setFromObject(group,true)
    group.userData.clearance=box.isEmpty()?0:Math.max(0,side?box.min.x+PAGE_CENTER:PAGE_CENTER-box.max.x)
    group.userData.height=box.isEmpty()?1:box.max.z
  })
  let disposed=false
  return {left,right,...layers,lights,composition:{matrix:placement.toArray(),scale,angle:layout.angle},
    animate(progress:number){
      for(const key of ['terrain','cabins','lighthouse'] as const)layers[key].forEach((group,side)=>{
        group.matrix.copy(spreadFoldMatrix(progress,side,key,group.userData.clearance,group.userData.height));group.visible=getPopUpState(progress)[key]>.001
      })
    },
    dispose(){if(disposed)return;disposed=true;left.removeFromParent();right.removeFromParent();geometries.forEach(g=>g.dispose())},
  }
}
