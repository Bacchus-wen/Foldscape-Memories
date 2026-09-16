import { LinearFilter, NoColorSpace, TextureLoader, Vector2, Vector3, Vector4 } from 'three';
import CircularGallery from './react-bits/CircularGallery.js';
import { samplePhotoJourney } from './photo-journey.js';
import { MORPH_SETTINGS } from './memory-photos.js';

export function createMorphUniforms() {
  return {
    morphEnabled: { value: 0 },
    tCurrent: { value: null }, tNext: { value: null },
    uResolution: { value: new Vector2(1118.277, 773.2398) },
    uCurrentSize: { value: new Vector2(1, 1) }, uNextSize: { value: new Vector2(1, 1) },
    uCurrentCrop: { value: new Vector4(0, 0, 1, 1) }, uNextCrop: { value: new Vector4(0, 0, 1, 1) },
    uProgress: { value: 0 }, uDir: { value: 1 }, uMode: { value: 0 },
    uIntensity: { value: MORPH_SETTINGS.intensity }, uScale: { value: MORPH_SETTINGS.scale },
    uAberration: { value: MORPH_SETTINGS.aberration }, uDrift: { value: MORPH_SETTINGS.drift },
    uTime: { value: 0 }, uReduce: { value: 0 }, uPointer: { value: new Vector2(.5, .5) },
    uOverlay: { value: MORPH_SETTINGS.overlay },
  };
}

export function createCoverMorph({ material, photos, draw, element, onState, scene, coverMesh, warmup }) {
  const uniforms = material.uniforms, textures = new Map();
  const bounds = new Vector4(), point = new Vector3();
  let gallery, disposed = false, loaded = false, prepared = false, position = 0, visible = false, retraction = 0, previousState = '';
  const report = state => { if (!disposed) onState(state); };
  const bind = (name, index) => {
    const texture = textures.get(index), crop = photos[index].crop;
    uniforms[name === 'Current' ? 'tCurrent' : 'tNext'].value = texture;
    uniforms[`u${name}Crop`].value.fromArray(crop);
    uniforms[`u${name}Size`].value.set(texture.image.width * crop[2], texture.image.height * crop[3]);
  };
  const syncFrame = () => {
    if (!loaded) return;
    const frame = samplePhotoJourney(position, photos.length);
    bind('Current', frame.current); bind('Next', frame.next);
    uniforms.uProgress.value = frame.transfer;
    // The original shader is driven by the reversible travel clock instead of
    // wall time, keeping the same image and warp when the user scrubs back.
    uniforms.uTime.value = frame.cursor * MORPH_SETTINGS.duration;
    gallery.update(frame, visible, uniforms.uReduce.value > .5, retraction);
    if (element) {
      Object.assign(element.dataset, {
        photoCurrent: String(frame.current), photoTarget: String(frame.next), photoProgress: frame.transfer.toFixed(3),
        photoEffect: 'react-bits-morph-slider-melt', photoJourney: position.toFixed(4),
        photoReveal: frame.reveal.toFixed(4), externalPhotos: String(gallery.root.visible),
        photoGallery: 'react-bits-circular-gallery-three', photoGap: '20', photoCardScale: '2',
      });
    }
    const state = { ready: true, prepared, index: frame.index, target: frame.next, busy: frame.busy, error: '' };
    const key = JSON.stringify(state);
    if (key !== previousState) { previousState = key; report(state); }
    draw();
  };
  report({ ready: false, prepared: false, index: 0, target: 0, busy: false, error: '' });
  const loader = new TextureLoader();
  Promise.all(photos.map(async (photo, index) => {
    const texture = await loader.loadAsync(photo.image);
    if (disposed) { texture.dispose(); return; }
    texture.colorSpace = NoColorSpace;
    texture.flipY = true;
    texture.generateMipmaps = false;
    texture.minFilter = texture.magFilter = LinearFilter;
    textures.set(index, texture);
  })).then(async () => {
    if (disposed) return;
    uniforms.morphEnabled.value = 1;
    bind('Current', 0); bind('Next', 1);
    gallery = new CircularGallery({ scene, photos, textures, element });
    loaded = true;
    syncFrame();
    // Browsing is ready as soon as its textures are ready. GPU preparation only
    // gates unfolding, and must not disable the photograph's wheel/drag input.
    try { await warmup(); }
    catch (error) { if (!disposed) console.warn('Scene preparation deferred to first render.', error); }
    if (disposed) return;
    prepared = true;
    syncFrame();
  }).catch(() => report({ ready: false, index: 0, target: 0, busy: false, error: 'Some photographs could not load. Reload to try again.' }));
  return {
    seek(value) { position = value; syncFrame(); },
    project(camera) {
      if (!loaded || !visible || !coverMesh) return;
      coverMesh.updateWorldMatrix(true, false);
      coverMesh.skeleton?.update();
      camera.updateMatrixWorld();
      let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity, far = -Infinity;
      for (let i = 0; i < coverMesh.geometry.attributes.position.count; i++) {
        coverMesh.getVertexPosition(i, point).applyMatrix4(coverMesh.matrixWorld).project(camera);
        left = Math.min(left, point.x); right = Math.max(right, point.x);
        bottom = Math.min(bottom, point.y); top = Math.max(top, point.y);
        far = Math.max(far, point.z);
      }
      bounds.set(left, bottom, right - left, top - bottom);
      gallery.project(camera, bounds, far);
      element.dataset.coverBounds = [left, bottom, right, top].map(value => value.toFixed(5)).join(',');
    },
    activity(nextVisible, nextReduced, nextRetraction = 0) {
      visible = nextVisible;
      retraction = nextRetraction;
      uniforms.uReduce.value = nextReduced ? 1 : 0;
      syncFrame();
    },
    dispose(preparation) {
      if (disposed) return;
      disposed = true;
      const release = () => {
        gallery?.dispose();
        uniforms.morphEnabled.value = 0;
        uniforms.tCurrent.value = uniforms.tNext.value = null;
        for (const texture of textures.values()) texture.dispose();
        textures.clear();
      };
      if (preparation) void preparation.catch(() => {}).finally(release);
      else release();
    },
  };
}
