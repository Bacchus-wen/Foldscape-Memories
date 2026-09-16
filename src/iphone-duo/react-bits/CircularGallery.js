// React Bits CircularGallery / Media, adapted from David Haz's public source.
// Original: F:/工具/react-bits-duo/CircularGallery.original.jsx
// OGL -> Three.js port: shared device camera, controlled progress, cylindrical
// depth, receiving-edge deformation and portal mask. See docs/circular-gallery-motion.md.
import { DoubleSide, Group, Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector3, Vector4 } from 'three';
import { photoPlacement } from '../photo-journey.js';

// CircularGallery's half-chord / sagitta radius, extended around the Y axis.
export function circularGalleryPose(track, bend = .85, halfWidth = 1.8) {
  const radius = (halfWidth * halfWidth + bend * bend) / (2 * bend);
  const angle = Math.max(-2.7, Math.min(2.7, track / radius));
  const arc = radius * (1 - Math.cos(angle));
  return { x: radius * Math.sin(angle), y: arc * .24, z: -arc, yaw: angle, roll: -Math.sin(angle) * .08 };
}

export function receptionBounds(left, right, canvasWidth, gap = 20) {
  const bezel = (right - left) * .02;
  return [(left + 1) * canvasWidth / 2 - bezel * canvasWidth / 2 - gap,
    (right + 1) * canvasWidth / 2 + bezel * canvasWidth / 2 + gap];
}

// Domain-warped noise gives the receiving edge a liquid contour and UV flow.
// It shares the journey clock with the screen's Melt so scrubbing is reversible.
const meltNoise = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x),
    mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);
}
float fbm(vec2 p) {
  float result = 0., amplitude = .5;
  for (int i = 0; i < 3; i++) {
    result += amplitude * noise(p);
    p = mat2(.8, -.6, .6, .8) * p * 2.03 + 13.1;
    amplitude *= .5;
  }
  return result;
}
`;

const vertex = `
uniform float uTime;
uniform float uSpeed;
uniform float uStretch;
uniform float uEdge;
uniform float uContact;
uniform float uReduce;
varying vec2 vUv;
varying vec3 vNormal;
varying float vPull;
${meltNoise}
void main() {
  vUv = uv;
  vec3 p = position;
  // CircularGallery's subdivided sinusoidal surface. Controlled time makes
  // backwards scrubbing deterministic; scale is reduced for photographic paper.
  p.z = (sin(p.x * 4.0 + uTime) * 1.5 + cos(p.y * 2.0 + uTime) * 1.5)
    * (0.1 + uSpeed * 0.5) * .22 * (1.0 - uReduce);
  float leading = uEdge < 0.0 ? 1.0 - uv.x : uv.x;
  float contact = uEdge < 0.0 ? 1.0 - uContact : uContact;
  float pull = smoothstep(contact - .5, contact, leading) * uStretch * (1.0 - uReduce);
  vPull = pull;
  float liquid = fbm(uv * 4.9 + vec2(uTime * .4, -uTime * .3));
  float curl = sin(uv.y * 10.0 + liquid * 7.0 + uTime * 2.0);
  // Uneven lobes, rather than a uniform trapezoid. The height stays below the cover.
  p.y *= 1.0 + pull * (.20 + .12 * sin(uv.x * 8.0 + liquid * 6.0));
  p.y += pull * .035 * curl;
  p.x += uEdge * pull * (.10 + .055 * curl);
  p.z += pull * (.10 * sin(uv.y * 6.2831853 + liquid * 5.0));
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const fragment = `
uniform sampler2D tMap;
uniform vec2 uImageSizes;
uniform vec2 uPlaneSizes;
uniform vec4 uCrop;
uniform float uBorderRadius;
uniform float uOpacity;
uniform float uDepth;
uniform vec2 uPortalPixels;
uniform float uPixelRatio;
uniform float uTime;
uniform float uEdge;
varying vec2 vUv;
varying vec3 vNormal;
varying float vPull;
${meltNoise}
float roundedBoxSDF(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b;
  return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0) - r;
}
vec3 photo(vec2 uv) { return texture2D(tMap, uCrop.xy + clamp(uv, 0.0, 1.0) * uCrop.zw).rgb; }
void main() {
  float pixelX = gl_FragCoord.x / uPixelRatio;
  // A CSS-pixel gap remains empty: no light bridge and no image over the cover.
  if (pixelX >= uPortalPixels.x && pixelX <= uPortalPixels.y) discard;
  vec2 ratio = vec2(
    min((uPlaneSizes.x / uPlaneSizes.y) / (uImageSizes.x / uImageSizes.y), 1.0),
    min((uPlaneSizes.y / uPlaneSizes.x) / (uImageSizes.y / uImageSizes.x), 1.0)
  );
  vec2 uv = vUv * ratio + (1.0 - ratio) * .5;
  float d = roundedBoxSDF(vUv - .5, vec2(.5 - uBorderRadius), uBorderRadius);
  float alpha = 1.0 - smoothstep(-.002, .002, d);
  if (alpha < .001) discard;
  vec2 flow = vec2(fbm(vUv * 4.9 + vec2(uTime * .4, 0.0)),
    fbm(vUv.yx * 4.9 + vec2(7.3, -uTime * .4)));
  vec2 liquid = vec2(fbm(vUv * 4.9 + flow * 3.0), fbm(vUv.yx * 4.9 - flow * 3.0));
  uv += (liquid - .4375) * vec2(.27 * uEdge, .22) * vPull;
  // Depth-of-field on far photographs, with a soft camera-facing key light.
  float blur = smoothstep(.35, 1.8, uDepth) * .004;
  vec3 color = photo(uv) * .4;
  color += (photo(uv + vec2(blur, 0.0)) + photo(uv - vec2(blur, 0.0))
    + photo(uv + vec2(0.0, blur)) + photo(uv - vec2(0.0, blur))) * .15;
  vec2 fringe = vec2(.016 * uEdge, .008 * sin(flow.y * 9.0)) * vPull;
  color.r = mix(color.r, photo(uv + fringe).r, vPull);
  color.b = mix(color.b, photo(uv - fringe).b, vPull);
  float key = .84 + .16 * max(dot(normalize(vNormal), normalize(vec3(-.25, .45, 1.0))), 0.0);
  color *= key;
  color = mix(color, vec3(.955, .951, .935), min(uDepth * .055, .17));
  color += (1.0 - smoothstep(.0, .009, -d)) * .035;
  gl_FragColor = vec4(color, alpha * uOpacity);
}
`;

class Media {
  constructor(geometry, texture, crop, portal, pixelRatio) {
    this.program = new ShaderMaterial({
      vertexShader: vertex, fragmentShader: fragment, transparent: true,
      depthTest: true, depthWrite: false, side: DoubleSide, toneMapped: false,
      uniforms: {
        tMap: { value: texture }, uCrop: { value: new Vector4(...crop) },
        uImageSizes: { value: new Vector2(texture.image.width * crop[2], texture.image.height * crop[3]) },
        uPlaneSizes: { value: new Vector2(1.446, 1) }, uBorderRadius: { value: .025 },
        uTime: { value: 0 }, uSpeed: { value: 0 }, uStretch: { value: 0 }, uEdge: { value: 0 }, uContact: { value: 0 },
        uReduce: { value: 0 }, uOpacity: { value: 0 }, uDepth: { value: 0 },
        uPortalPixels: portal, uPixelRatio: pixelRatio,
      },
    });
    this.plane = new Mesh(geometry, this.program);
    this.plane.frustumCulled = false;
  }
  update(frame, index, aspect, reduced) {
    const card = photoPlacement(index, frame);
    const pose = circularGalleryPose(card.center - .5);
    this.plane.position.set(pose.x, pose.y, pose.z);
    this.plane.rotation.set(0, pose.yaw, pose.roll);
    this.plane.scale.set(card.width, card.width / aspect, card.width);
    this.plane.renderOrder = 20 - Math.round(-pose.z * 2);
    const active = index === frame.current || index === frame.next;
    const edge = index === frame.current ? 0 : 1;
    const stretch = active ? Math.max(0, 1 - Math.abs(card.center - edge) / .5) * Math.sin(frame.time * Math.PI) : 0;
    Object.assign(this.program.uniforms.uTime, { value: frame.cursor * 1.1 });
    this.program.uniforms.uSpeed.value = Math.sin(frame.time * Math.PI) * .06;
    this.program.uniforms.uStretch.value = stretch;
    this.program.uniforms.uContact.value = Math.max(0, Math.min(1, (edge - card.center) / card.width + .5));
    this.program.uniforms.uEdge.value = index === frame.current ? 1 : -1;
    this.program.uniforms.uDepth.value = -pose.z;
    this.program.uniforms.uOpacity.value = frame.reveal;
    this.program.uniforms.uReduce.value = reduced ? 1 : 0;
  }
}

export default class CircularGallery {
  constructor({ scene, photos, textures, element }) {
    this.element = element;
    this.root = new Group();
    this.root.name = 'ReactBits-CircularGallery-Three-adapter';
    this.geometry = new PlaneGeometry(1, 1, 100, 50);
    this.portal = { value: new Vector2() };
    this.pixelRatio = { value: 1 };
    this.origin = new Vector3();
    this.left = new Vector3();
    this.right = new Vector3();
    this.medias = photos.map((photo, index) => new Media(this.geometry, textures.get(index), photo.crop, this.portal, this.pixelRatio));
    this.medias.forEach(media => this.root.add(media.plane));
    scene.add(this.root);
    this.root.visible = false;
  }
  update(frame, visible, reduced) {
    this.frame = frame;
    this.reduced = reduced;
    this.root.visible = visible && frame.reveal > 0;
  }
  project(camera, bounds, depth) {
    if (!this.frame) return;
    const { x: left, y: bottom, z: width, w: height } = bounds;
    this.origin.set(left + width / 2, bottom + height / 2, depth).unproject(camera);
    this.left.set(left, bottom + height / 2, depth).unproject(camera);
    this.right.set(left + width, bottom + height / 2, depth).unproject(camera);
    this.root.position.copy(this.origin);
    this.root.quaternion.copy(camera.quaternion);
    this.root.scale.setScalar(this.left.distanceTo(this.right));
    const canvasWidth = this.element.clientWidth;
    this.portal.value.fromArray(receptionBounds(left, left + width, canvasWidth));
    this.pixelRatio.value = this.element.width / Math.max(1, canvasWidth);
    const aspect = width * canvasWidth / (height * this.element.clientHeight);
    this.medias.forEach((media, index) => media.update(this.frame, index, aspect, this.reduced));
  }
  dispose() {
    this.root.removeFromParent();
    this.geometry.dispose();
    this.medias.forEach(media => media.program.dispose());
  }
}
