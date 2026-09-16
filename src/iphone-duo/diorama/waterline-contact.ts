import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'

/** Ground disconnected ice / hull pieces together, including pieces split by the old hinge. */
export function groundWaterline(sources:BufferGeometry[],waterline=.004,immersionLimits:number[]=[]) {
  const keys=new Map<string,number>(),parents:number[]=[],vertices:number[][]=[]
  const root=(i:number):number=>parents[i]===i?i:(parents[i]=root(parents[i]))
  for(const source of sources){
    const p=source.attributes.position,ids:number[]=[]
    for(let i=0;i<p.count;i++){
      const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e5)).join(',')
      if(!keys.has(key)){keys.set(key,parents.length);parents.push(parents.length)}
      ids.push(keys.get(key)!)
    }
    const count=source.index?.count??p.count
    for(let i=0;i<count;i+=3){
      const triangle=[0,1,2].map(j=>ids[source.index?source.index.getX(i+j):i+j])
      for(const id of triangle)parents[root(id)]=root(triangle[0])
    }
    vertices.push(ids)
  }
  const bounds=new Map<number,{min:number;max:number;immersion:number}>()
  sources.forEach((source,s)=>vertices[s].forEach((id,i)=>{
    const key=root(id),z=source.attributes.position.getZ(i),b=bounds.get(key)??{min:Infinity,max:-Infinity,immersion:.024}
    b.min=Math.min(b.min,z);b.max=Math.max(b.max,z);b.immersion=Math.min(b.immersion,immersionLimits[s]??.024);bounds.set(key,b)
  }))
  return sources.map((source,s)=>{
    const result=source.clone(),p=result.attributes.position
    vertices[s].forEach((id,i)=>{
      const b=bounds.get(root(id))!,immersion=Math.min(b.immersion,(b.max-b.min)*.08)
      p.setZ(i,p.getZ(i)-b.min+waterline-immersion)
    })
    result.computeBoundingBox();result.computeBoundingSphere()
    return result
  })
}

/** Repair the low open rims left when the generated ocean floor was removed. */
export function extendToWaterline(source:BufferGeometry,waterline=.004,rimLimit=.12) {
  const position=source.attributes.position
  const key=(i:number)=>[position.getX(i),position.getY(i),position.getZ(i)].map(v=>Math.round(v*1e5)).join(',')
  const keys=Array.from({length:position.count},(_,i)=>key(i))
  const edges=new Map<string,{a:number;b:number;count:number}>()
  const count=source.index?.count??position.count
  for(let i=0;i<count;i+=3){
    const triangle=[0,1,2].map(j=>source.index?source.index.getX(i+j):i+j)
    for(let j=0;j<3;j++){
      const a=triangle[j],b=triangle[(j+1)%3],ka=keys[a],kb=keys[b]
      if(ka===kb)continue
      const edgeKey=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`,edge=edges.get(edgeKey)
      if(edge)edge.count++;else edges.set(edgeKey,{a,b,count:1})
    }
  }
  const base=source.index?source.toNonIndexed():source.clone()
  const extra:Record<string,number[]>={}
  for(const name of Object.keys(source.attributes))extra[name]=[]
  let repaired=0
  for(const {a,b,count} of edges.values()){
    if(count!==1 || Math.max(position.getZ(a),position.getZ(b))>rimLimit || Math.min(position.getZ(a),position.getZ(b))<=waterline)continue
    const pa=new Vector3().fromBufferAttribute(position,a),pb=new Vector3().fromBufferAttribute(position,b)
    const lowerA=pa.clone();lowerA.z=waterline
    const normal=pa.clone().sub(pb).cross(lowerA.clone().sub(pb)).normalize()
    for(const [index,lower] of [[b,false],[a,false],[a,true],[b,false],[a,true],[b,true]] as const){
      for(const [name,attribute] of Object.entries(source.attributes))for(let k=0;k<attribute.itemSize;k++){
        let value=attribute.getComponent(index,k)
        if(name==='position'&&k===2&&lower)value=waterline
        if(name==='normal')value=normal.getComponent(k)
        extra[name].push(value)
      }
    }
    repaired++
  }
  for(const [name,values] of Object.entries(extra)){
    const attribute=base.attributes[name],array=new Float32Array(attribute.array.length+values.length)
    array.set(attribute.array);array.set(values,attribute.array.length)
    base.setAttribute(name,new Float32BufferAttribute(array,attribute.itemSize))
  }
  base.userData.waterlineRims=repaired
  base.computeBoundingBox();base.computeBoundingSphere()
  return base
}
