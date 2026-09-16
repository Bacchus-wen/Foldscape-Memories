import { DataTexture, MeshStandardMaterial, RGBAFormat, SRGBColorSpace, UnsignedByteType, type SkinnedMesh } from 'three'

const hash=(x:number,y:number)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v)}
const noise=(x:number,y:number)=>{
  const ix=Math.floor(x),iy=Math.floor(y),a=x-ix,b=y-iy,u=a*a*(3-2*a),v=b*b*(3-2*b)
  return (hash(ix,iy)*(1-u)+hash(ix+1,iy)*u)*(1-v)+(hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u)*v
}
export const coastline=(x:number)=>.44+.055*Math.sin(x*4)+.018*Math.sin(x*17)

/** Fine-scale surface colour and relief, shared with the offline composition check. */
export function groundPixels(id:string,width=1024,height=768) {
  const color=new Uint8Array(width*height*4),bump=new Uint8Array(width*height*4)
  for(let j=0;j<height;j++)for(let i=0;i<width;i++){
    const x=(i/width-.5)*2.12766,y=(.5-j/height)*1.48758,k=(j*width+i)*4
    const fine=hash(i,j),medium=noise(x*58,y*58),large=noise(x*5,y*5)
    let rgb=[96,121,167],relief=.5
    if(id==='coastal-house'){
      const edge=coastline(x),path=Math.abs(y+.30-.11*Math.sin(x*2.8))
      const worn=Math.max(0,1-path/.042),shore=Math.max(0,1-Math.abs(y-edge)/.052)
      const s=.73+.25*large+.16*medium+.1*fine
      rgb=[118*s,115*s,77*s]
      rgb=rgb.map((c,n)=>c*(1-worn*.7)+[150,139,110][n]*worn*.7)
      rgb=rgb.map((c,n)=>c*(1-shore*.7)+[103,101,87][n]*shore*.7)
      if(y>edge)rgb=[72+medium*8,103+medium*8,111+medium*8]
      relief=.35+medium*.25+fine*.12+worn*.06
    } else if(id==='santorini') {
      // Staggered small weathered paving; never a screen-sized checkerboard.
      const row=Math.floor(y*31),xx=x*28+(row%2)*.5,yy=y*31
      const fx=xx-Math.floor(xx),fy=yy-Math.floor(yy)
      const mortar=Math.min(fx,1-fx,fy,1-fy)<.032
      const stone=hash(Math.floor(xx),row),s=.84+stone*.11+medium*.04+fine*.035
      rgb=mortar?[153,145,128]:[219*s,209*s,185*s]
      relief=mortar?.2:.52+medium*.07+fine*.025
    } else if(id==='osaka-castle') {
      const path=Math.abs(y+.47-.05*Math.sin(x*4))<.05 || Math.abs(x+.76)<.043
      const s=.76+large*.19+medium*.14+fine*.09
      rgb=path?[161*s,150*s,123*s]:[102*s,112*s,69*s]
      relief=.42+medium*.16+fine*.09
    } else if(id==='iceberg') rgb=[94+medium*4,133+medium*4,145+medium*4]
    for(let c=0;c<3;c++){color[k+c]=Math.round(rgb[c]);bump[k+c]=Math.round(relief*255)}
    color[k+3]=bump[k+3]=255
  }
  return {color,bump,width,height}
}

export function createScreenGround(screen:SkinnedMesh,id:string) {
  const pixels=groundPixels(id)
  const map=new DataTexture(pixels.color,pixels.width,pixels.height,RGBAFormat,UnsignedByteType)
  const bump=new DataTexture(pixels.bump,pixels.width,pixels.height,RGBAFormat,UnsignedByteType)
  map.colorSpace=SRGBColorSpace;map.needsUpdate=true;bump.needsUpdate=true
  map.anisotropy=bump.anisotropy=8
  const material=new MeshStandardMaterial({map,bumpMap:bump,bumpScale:.024,roughness:.96,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2})
  const ground=screen.clone(false)
  // Exact screen vertices, UVs and skeleton: no second guessed outline or inner rounded corners.
  ground.geometry=screen.geometry;ground.material=material;ground.name=`${id}-continuous-screen-ground`
  ground.receiveShadow=true;ground.castShadow=false;ground.frustumCulled=false
  screen.parent!.add(ground)
  return {ground,update(progress:number){ground.visible=progress>.012},dispose(){ground.removeFromParent();material.dispose();map.dispose();bump.dispose()}}
}
