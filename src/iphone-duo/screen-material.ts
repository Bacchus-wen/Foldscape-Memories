import { Matrix4, ShaderMaterial, Vector2 } from 'three'
import { morphShader } from './morph-shader'
import { createMorphUniforms } from './cover-morph'

export function createScreenMaterial(cover: boolean) {
  return new ShaderMaterial({
    // Brightness and wallpaper drift are independent of the focus kernel.
    uniforms: { ...createMorphUniforms(), contentShift: { value: 0 }, screenBrightness: { value: 1 }, wallpaperShift: { value: 0 }, foldEffects: { value: 1 }, foldProjection: { value: 1 }, contentRotation: { value: 0 }, contentAspect: { value: cover ? 800 / 1120 : 1600 / 1120 }, dualWallpaper: { value: 0 }, bodyInverse: { value: new Matrix4() }, screenMap: { value: undefined }, overlayMap: { value: undefined }, hasOverlay: { value: 0 }, revealMap: { value: undefined }, hasReveal: { value: 0 }, resolution: { value: new Vector2(1600, 1200) }, progress: { value: 0 }, focusEdge: { value: cover ? 1.25 : 0.5 }, defocus: { value: 1 }, innerFocusFlip: { value: 0 }, blur: { value: 28 }, parallax: { value: 1 }, cover: { value: cover ? 1 : 0 }, depthMap: { value: undefined }, hasDepth: { value: 0 }, depthPointer: { value: new Vector2() }, depthStrength: { value: 0 } },
    vertexShader: `
      #include <common>
      #include <skinning_pars_vertex>
      uniform mat4 bodyInverse;
      varying vec2 screenUv;
      varying vec3 displayPosition;
      varying vec3 displayCamera;
      varying vec3 coverStart;
      varying vec3 coverEnd;
      void main() {
        #include <skinbase_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        displayPosition = (bodyInverse * modelMatrix * vec4(transformed, 1.0)).xyz;
        displayCamera = (bodyInverse * vec4(cameraPosition, 1.0)).xyz;
        mat4 skinTransform = mat4(1.0);
        #ifdef USE_SKINNING
          skinTransform = bindMatrixInverse * (skinWeight.x * boneMatX + skinWeight.y * boneMatY + skinWeight.z * boneMatZ + skinWeight.w * boneMatW) * bindMatrix;
        #endif
        coverStart = (bodyInverse * modelMatrix * skinTransform * vec4(-0.233750, -0.276746, 0.0, 1.0)).xyz;
        coverEnd = (bodyInverse * modelMatrix * skinTransform * vec4(-7.966148, -0.276746, 0.0, 1.0)).xyz;
        screenUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      uniform float morphEnabled;
      ${morphShader}
      uniform float screenBrightness;
      uniform float wallpaperShift;
      uniform float contentShift;
      uniform float foldEffects;
      uniform float foldProjection;
      uniform float contentRotation;
      uniform float contentAspect;
      uniform float dualWallpaper;
      uniform sampler2D screenMap;
      uniform sampler2D overlayMap;
      uniform float hasOverlay;
      uniform sampler2D revealMap;
      uniform float hasReveal;
      uniform float parallax;
      uniform vec2 resolution;
      uniform float progress;
      uniform float focusEdge;
      uniform float defocus;
      uniform float innerFocusFlip;
      uniform float blur;
      uniform float cover;
      uniform sampler2D depthMap;
      uniform float hasDepth;
      uniform vec2 depthPointer;
      uniform float depthStrength;
      varying vec2 screenUv;
      varying vec3 displayPosition;
      varying vec3 displayCamera;
      varying vec3 coverStart;
      varying vec3 coverEnd;
      vec4 sampleLayer(sampler2D layer, vec2 uv, vec2 footprint) {
        // Each layer has its own pixel density (including 3x icon canvases).
        // Convert the same physical blur footprint into that texture's LOD.
        vec2 size = vec2(textureSize(layer, 0));
        vec2 pixels = footprint * size;
        float radius = max(pixels.x, pixels.y);
        float blurLod = 0.5 * log2(1.0 + radius * radius / 9.0);
        vec2 dx = dFdx(uv) * size, dy = dFdy(uv) * size;
        float nativeLod = 0.5 * log2(max(1.0, max(dot(dx, dx), dot(dy, dy))));
        return textureLod(layer, uv, max(nativeLod, blurLod));
      }
      vec4 sampleScreen(vec2 wallpaperUv, vec2 contentUv, vec2 planeUv, vec2 wallpaperFootprint, vec2 contentFootprint, float projection) {
        // Filter the black/image boundary IN the same kernel as the image.
        // Its prefilter matches the texture mip footprint; outer-edge defocus
        // therefore softens the silhouette more than the hinge-side focus.
        float feather = max(fwidth(planeUv.y) * 0.75, max(0.001, contentFootprint.y / 3.0));
        float coverCoverage = smoothstep(-feather, feather, planeUv.y)
          * (1.0 - smoothstep(1.0 - feather, 1.0 + feather, planeUv.y));
        float innerCoverage = smoothstep(-0.01, 0.018, planeUv.x) * (1.0 - smoothstep(0.982, 1.01, planeUv.x));
        innerCoverage *= smoothstep(-0.035, 0.015, planeUv.y) * (1.0 - smoothstep(0.985, 1.035, planeUv.y));
        float coverage = mix(1.0, mix(innerCoverage, coverCoverage, cover), projection);
        float c = cos(contentRotation), s = sin(contentRotation);
        mat2 orientation = mat2(c, s, -s, c);
        mat2 footprintRotation = mat2(abs(c), abs(s), abs(s), abs(c));
        wallpaperUv = orientation * (wallpaperUv - 0.5) + 0.5;
        wallpaperFootprint = footprintRotation * wallpaperFootprint;
        float physicalAspect = mix(15.784507 / 11.03588, 7.732398 / 11.18277, cover);
        vec2 contentMetric = orientation * ((contentUv - 0.5) * vec2(physicalAspect, 1.0));
        vec2 rotatedBounds = vec2(abs(c) * physicalAspect + abs(s), abs(s) * physicalAspect + abs(c));
        float contentFit = min(contentAspect / max(rotatedBounds.x, 0.0001), 1.0 / max(rotatedBounds.y, 0.0001));
        contentUv = contentMetric * contentFit / vec2(contentAspect, 1.0) + 0.5;
        contentFootprint = footprintRotation * (contentFootprint * vec2(physicalAspect, 1.0)) * contentFit / vec2(contentAspect, 1.0);
        if (dualWallpaper > 0.5) {
          wallpaperUv.x = fract(wallpaperUv.x * 2.0);
          wallpaperFootprint.x *= 2.0;
        }
        float screenAspect = mix(15.784507 / 11.03588, 7.732398 / 11.18277, cover);
        if (abs(s) > 0.5) screenAspect = 1.0 / screenAspect;
        if (dualWallpaper > 0.5) screenAspect *= 0.5;
        float imageAspect = resolution.x / max(resolution.y, 1.0);
        vec2 crop = vec2(min(1.0, screenAspect / imageAspect), min(1.0, imageAspect / screenAspect));
        // Translate within the existing cover crop. Never animate texture scale
        // to hide an edge: uploads without spare crop simply have less travel.
        vec2 drift = orientation * vec2(wallpaperShift * foldEffects * clamp(parallax, 0.0, 1.0), 0.0) * crop;
        vec2 cropMargin = (1.0 - crop) * 0.5;
        drift = clamp(drift, -cropMargin, cropMargin);
        vec2 backgroundUv = clamp((wallpaperUv - 0.5) * crop + 0.5 + drift, vec2(0.001), vec2(0.999));
        vec4 background = sampleLayer(screenMap, backgroundUv, wallpaperFootprint * crop);
        float inside = step(0.0, contentUv.x) * step(contentUv.x, 1.0) * step(0.0, contentUv.y) * step(contentUv.y, 1.0);
        vec2 layerUv = clamp(contentUv, vec2(0.001), vec2(0.999));
        // These switches are uniform across the draw, so hidden layers do not
        // spend texture fetches in every blur sample (or sample an empty map).
        if (hasReveal > 0.5) {
          vec4 reveal = sampleLayer(revealMap, layerUv, contentFootprint);
          background.rgb = mix(background.rgb, reveal.rgb, reveal.a * inside);
        }
        if (hasOverlay > 0.5) {
          vec4 content = sampleLayer(overlayMap, layerUv, contentFootprint);
          background.rgb = mix(background.rgb, content.rgb, content.a * inside);
        }
        return vec4(background.rgb * coverage, 1.0);
      }
      float safeRayDepth(float value) {
        if (abs(value) >= 0.001) return value;
        return value < 0.0 ? -0.001 : 0.001;
      }
      void main() {
        if (morphEnabled > 0.5 && cover > 0.5) {
          // Authored portrait UVs are top-down. The closed memory pose rotates
          // the body 90°; transpose into landscape, bottom-up photo space.
          gl_FragColor = sampleMorph(vec2(screenUv.y, screenUv.x));
          return;
        }
        if (cover < 0.5 && progress < 0.02) discard;
        float projection = 0.0;
        vec2 projectedUv = screenUv;
        if (foldProjection > 0.5) {
          vec3 ray = displayPosition - displayCamera;
          vec2 planeUv;
          if (cover > 0.5) {
            // Anchor the virtual image plane to the hinge-side display edge,
            // not z=0 behind the closed cover. Projection is already identity
            // at rest, so no early-progress blend or uniform shrink is needed.
            float planeZ = coverStart.z;
            vec3 intersection = displayCamera + ray * ((planeZ - displayCamera.z) / safeRayDepth(ray.z));
            vec3 endRay = coverEnd - displayCamera;
            float startX = coverStart.x;
            float endX = displayCamera.x + endRay.x * ((planeZ - displayCamera.z) / safeRayDepth(endRay.z));
            float span = endX - startX;
            planeUv.x = abs(span) > 0.001 ? (intersection.x - startX) / span : screenUv.x;
            // Apply only the ray's vertical displacement to authored UVs. At
            // both flat endpoints this is exactly zero, retaining their framing.
            planeUv.y = screenUv.y - (intersection.y - displayPosition.y) / 11.18277;
            projection = 1.0;
          } else {
            vec3 intersection = displayCamera + ray * (-displayCamera.z / min(ray.z, -0.001));
            planeUv = vec2(intersection.x / 15.784507 + 0.5, 0.5 - intersection.y / 11.03588);
            projection = (1.0 - smoothstep(0.18, 0.5, screenUv.x)) * (1.0 - smoothstep(0.9, 1.0, progress));
          }
          projection *= clamp(parallax, 0.0, 1.0);
          projectedUv = mix(screenUv, planeUv, projection);
        }
        vec2 wallpaperUv = projectedUv;
        float depthValue = texture2D(depthMap, clamp(wallpaperUv, vec2(0.001), vec2(0.999))).r;
        float depthDistance = depthValue - 0.54;
        wallpaperUv += depthPointer * depthDistance * 0.024 * depthStrength * hasDepth;
        // Shift the UI independently of wallpaper and virtual-plane bounds.
        // No scaling/reflow: all icons and widgets share one display-space move.
        vec2 contentUv = projectedUv + vec2(contentShift * foldEffects * clamp(parallax, 0.0, 1.0), 0.0);
        // A broad squared-distance response grows away from the focus plane.
        // Unlike a narrow smoothstep wipe, its slope starts at zero and it has
        // no far edge at which the blur suddenly reaches a uniform plateau.
        float coverDistance = max(0.0, screenUv.x - focusEdge + 0.5);
        float coverWave = 1.0 - exp(-coverDistance * coverDistance / 0.45);
        float focusX = mix(screenUv.x, 1.0 - screenUv.x, innerFocusFlip);
        float innerDistance = max(0.0, focusEdge - focusX);
        float innerWave = 1.0 - exp(-innerDistance * innerDistance / 0.11);
        float amount = defocus * mix(innerWave, coverWave, cover);
        float contentRadius = foldEffects * blur * amount * mix(3.5, 1.8, cover);
        float wallpaperRadius = contentRadius + abs(depthDistance) * 1.65 * depthStrength * hasDepth;
        // Radius is measured on the display, independent of the uploaded image.
        vec2 displayResolution = vec2(mix(1600.0, 800.0, cover), 1120.0);
        vec2 wallpaperFootprint = wallpaperRadius / displayResolution;
        vec2 contentFootprint = contentRadius / displayResolution;
        vec4 color = sampleScreen(wallpaperUv, contentUv, projectedUv, wallpaperFootprint, contentFootprint, projection);
        float weight = 1.0;
        // Opposite pairs keep the kernel centered and remove the four-tap
        // directional ghosts. Mip filtering fills the space between samples.
        for (int i = 1; i <= 6; i++) {
          float f = float(i);
          float distance = sqrt((f - 0.5) / 6.0);
          float angle = f * 2.399963;
          vec2 direction = vec2(cos(angle), sin(angle)) * distance * 0.35;
          vec2 wallpaperOffset = direction * wallpaperFootprint;
          vec2 contentOffset = direction * contentFootprint;
          float w = exp(-distance * distance * 2.0);
          color += sampleScreen(
            wallpaperUv + wallpaperOffset,
            contentUv + contentOffset,
            projectedUv + contentOffset,
            wallpaperFootprint,
            contentFootprint,
            projection
          ) * w;
          color += sampleScreen(
            wallpaperUv - wallpaperOffset,
            contentUv - contentOffset,
            projectedUv - contentOffset,
            wallpaperFootprint,
            contentFootprint,
            projection
          ) * w;
          weight += 2.0 * w;
        }
        color /= weight;
        float foldShade = foldEffects * sin(progress * 3.14159265);
        float innerShade = foldShade * 0.18 * (1.0 - smoothstep(0.3, 0.5, screenUv.x));
        float coverShade = foldShade * 0.52 * smoothstep(0.05, 0.95, screenUv.x);
        color.rgb *= 1.0 - mix(innerShade, coverShade, cover);
        color.rgb *= mix(1.0, screenBrightness, foldEffects * (1.0 - cover));
        gl_FragColor = color;
        #include <colorspace_fragment>
      }
    `,
    toneMapped: false,
  })
}
