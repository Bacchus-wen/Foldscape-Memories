import { Color, Mesh, ShadowMaterial, Shape, ShapeGeometry, type Group, type ShaderMaterial } from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'

// Each half reflects the actual architecture from its own moving screen plane.
// Hiding both water surfaces during reflection prevents recursive mirror passes.
export function createCoastalWater(left: Group, right: Group, resolution = 768) {
  const geometries = [0,1].map(side=>{
    const shape=new Shape(),x=.5/.94,y=.74379,r=.06
    const l=side?0:r,rr=side?r:0
    shape.moveTo(-x+l,-y).lineTo(x-rr,-y).quadraticCurveTo(x,-y,x,-y+rr)
    shape.lineTo(x,y-rr).quadraticCurveTo(x,y,x-rr,y)
    shape.lineTo(-x+l,y).quadraticCurveTo(-x,y,-x,y-l)
    shape.lineTo(-x,-y+l).quadraticCurveTo(-x,-y,-x+l,-y)
    return new ShapeGeometry(shape,12)
  })
  const shader = {
    name: 'Lighthouse coastal reflection',
    uniforms: {
      color: { value: new Color('#647db7') },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      pageOffset: { value: 0 },
      time: { value: 0 },
      landMask: { value: 0 },
    },
    vertexShader: `
      uniform mat4 textureMatrix;
      uniform float pageOffset;
      varying vec4 vReflection;
      varying vec2 vCoast;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vReflection = textureMatrix * vec4(position, 1.0);
        vCoast = position.xy + vec2(pageOffset, 0.0);
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform sampler2D tDiffuse;
      uniform float time;
      uniform float landMask;
      varying vec4 vReflection;
      varying vec2 vCoast;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p) {
        vec2 cell=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(cell),hash(cell+vec2(1,0)),f.x),mix(hash(cell+vec2(0,1)),hash(cell+vec2(1,1)),f.x),f.y);
      }
      void main() {
        #include <logdepthbuf_fragment>
        vec2 p = vCoast;
        if (landMask > .5 && p.y < .44+.055*sin(p.x*4.0)+.018*sin(p.x*17.0)) discard;
        float phase = time * .2;
        float longWave = sin(p.y*165.0 + noise(p*vec2(13.0,22.0))*9.0 + phase);
        float smallWave = sin(p.y*710.0 + noise(p*vec2(39.0,48.0))*12.0 - phase);
        float fineWave = sin(p.y*1900.0 + sin(p.x*150.0)*3.0)*noise(p*vec2(50.0,130.0));
        vec2 reflectionUv = vReflection.xy / vReflection.w;
        reflectionUv += vec2(longWave*.0009 + smallWave*.00055, smallWave*.00065);
        vec4 reflected = texture2D(tDiffuse, reflectionUv);
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float fresnel = pow(1.0-clamp(dot(viewDirection, normalize(vWorldNormal)),0.0,1.0),3.0);
        float softBand = .5+.5*sin(p.y*3.2 + .3);
        vec3 water = mix(color*.76, color*1.2,softBand);
        water = mix(water, vec3(.32,.27,.37), .14*smoothstep(-.15,.73,p.y));
        water += vec3(.017,.02,.032)*(longWave*.3 + smallWave*.18 + fineWave*.07);
        float reflectionAmount = (.7+fresnel*.22) * reflected.a;
        vec3 result = mix(water, reflected.rgb*.88 + water*.12, reflectionAmount);
        float glint = pow(max(0.0,smallWave*.5+fineWave*.5),12.0);
        result += vec3(.12,.10,.09)*glint*.08;
        gl_FragColor = vec4(result,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }
  const waters = [left, right].map((parent, index) => {
    const water = new Reflector(geometries[index], {
      textureWidth: resolution, textureHeight: resolution, clipBias: .001,
      color: '#647db7', multisample: 0, shader,
    })
    water.name = index ? 'right-coastal-water' : 'left-coastal-water'
    water.position.z = .008
    water.renderOrder = -1
    ;(water.material as ShaderMaterial).uniforms.pageOffset.value = index ? .532 : -.532
    parent.add(water)
    return water
  })
  const shadowMaterial = new ShadowMaterial({ color: '#26345e', opacity: .32, depthWrite: false })
  const shadows = [left, right].map((parent,index) => {
    const shadow = new Mesh(geometries[index], shadowMaterial)
    shadow.name = 'coastal-water-shadows'
    shadow.position.z = .0083
    shadow.receiveShadow = true
    parent.add(shadow)
    return shadow
  })
  const surfaces = [...waters, ...shadows]
  waters.forEach(water => {
    const reflect = water.onBeforeRender
    water.onBeforeRender = function (...args) {
      const visibility = surfaces.map(surface => surface.visible)
      surfaces.forEach(surface => { surface.visible = false })
      try { reflect.apply(this, args) }
      finally { surfaces.forEach((surface, index) => { surface.visible = visibility[index] }) }
    }
  })
  let disposed = false
  return {
    waters,
    update(progress: number, timeSeconds = 0, motionEnabled = false) {
      surfaces.forEach(water => { water.visible = progress > .014 })
      const shaderTime = motionEnabled ? timeSeconds : 0
      waters.forEach(water => { (water.material as ShaderMaterial).uniforms.time.value = shaderTime })
    },
    dispose() {
      if (disposed) return
      disposed = true
      waters.forEach(water => { water.removeFromParent(); water.dispose() })
      shadows.forEach(shadow => shadow.removeFromParent())
      shadowMaterial.dispose()
      geometries.forEach(geometry=>geometry.dispose())
    },
  }
}
