import { Group, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3, type SkinnedMesh } from 'three'
import { createCoastalWater, MEMORY_REFLECTION_LAYER } from './coastal-water.ts'
import { sceneEnvironment } from './scene-layout.ts'
import { coastline, createScreenGround } from './screen-ground.ts'

const noise=(x:number,y:number)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n)}

export function createSceneEnvironment(left:Group,right:Group,id:string,resolution=512,screen?:SkinnedMesh) {
  const {kind}=sceneEnvironment(id)
  const ground=screen?createScreenGround(screen,id):undefined
  const water=['water','ice','meadow'].includes(kind)?createCoastalWater(left,right,resolution):undefined
  if(water&&kind!=='water')water.waters.forEach(surface=>{
    surface.material.uniforms.color.value.set(kind==='ice'?'#638c96':'#48676f')
    surface.material.uniforms.landMask.value=kind==='meadow'?1:0
  })
  const groups=[new Group(),new Group()]
  left.add(groups[0]);right.add(groups[1])
  const geometry=new IcosahedronGeometry(1,1)
  const material=new MeshStandardMaterial({color:kind==='ice'?'#d9e5e7':'#726d5c',roughness:.9,flatShading:true})
  if(kind==='meadow'||kind==='ice')groups.forEach((group,side)=>{
    const count=kind==='ice'?14:80,mesh=new InstancedMesh(geometry,material,count)
    const matrix=new Matrix4(),q=new Quaternion(),p=new Vector3(),s=new Vector3()
    for(let i=0;i<count;i++){
      const x=-.50+noise(i+side*81,2),gx=x+(side?.532:-.532)
      const y=kind==='ice'?-.70+noise(i+side*31,3)*.4:coastline(gx)
      const r=kind==='ice'?.013+noise(i,7)*.027:.012+noise(i,7)*.019
      p.set(x,y,kind==='ice'?.012:.014);s.set(r*1.7,r,r*.45)
      matrix.compose(p,q,s);mesh.setMatrixAt(i,matrix)
    }
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.layers.enable(MEMORY_REFLECTION_LAYER);group.add(mesh)
  })
  let disposed=false
  return {kind, details: groups,
    update(progress:number,time=0,motion=false){
      ground?.update(progress);water?.update(progress,time,motion)
      groups.forEach(group=>{group.visible=progress>.014;group.scale.z=kind==='meadow'?1:Math.min(1,Math.max(0,progress/.2))})
    },
    dispose(){if(disposed)return;disposed=true;ground?.dispose();water?.dispose();groups.forEach(g=>{g.traverse(o=>{if(o instanceof InstancedMesh)o.dispose()});g.removeFromParent()});geometry.dispose();material.dispose()},
  }
}
