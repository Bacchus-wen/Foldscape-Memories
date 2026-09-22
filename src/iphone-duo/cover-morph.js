import { LinearFilter, NoColorSpace, TextureLoader, Vector2, Vector4 } from 'three';
import { createCoverProjection } from './cover-projection.js';
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
  const uniforms = material.uniforms, textures = new Map(), failed = new Set();
  const projectCover = coverMesh ? createCoverProjection(coverMesh) : null;
  let gallery, disposed = false, loaded = false, prepared = false, position = 0, visible = false, retraction = 0, previousState = '';
  const report = state => { if (!disposed) onState(state); };
  const available = () => { let count = 0; while (textures.has(count)) count++; return count; };
  const bind = (name, index) => {
    const texture = textures.get(index), crop = photos[index].crop;
    uniforms[name === 'Current' ? 'tCurrent' : 'tNext'].value = texture;
    uniforms[`u${name}Crop`].value.fromArray(crop);
    uniforms[`u${name}Size`].value.set(texture.image.width * crop[2], texture.image.height * crop[3]);
  };
  const syncFrame = () => {
    if (!loaded) return;
    const availableCount = available();
    const frame = samplePhotoJourney(position, photos.length);
    const current = frame.current;
    const next = textures.has(frame.next) ? frame.next : current;
    bind('Current', current); bind('Next', next);
    uniforms.uProgress.value = current === next ? 0 : frame.transfer;
    // The original shader is driven by the reversible travel clock instead of
    // wall time, keeping the same image and warp when the user scrubs back.
    uniforms.uTime.value = frame.cursor * MORPH_SETTINGS.duration;
    gallery.update(frame, visible, uniforms.uReduce.value > .5, retraction);
    gallery.medias.forEach((media, index) => { media.plane.visible = index < availableCount; });
    if (element) {
      Object.assign(element.dataset, {
        photoCurrent: String(frame.current), photoTarget: String(frame.next), photoProgress: frame.transfer.toFixed(3),
        photoEffect: 'react-bits-morph-slider-melt', photoJourney: position.toFixed(4),
        photoReveal: frame.reveal.toFixed(4), externalPhotos: String(gallery.root.visible),
        photoGallery: 'react-bits-circular-gallery-three', photoGap: '20', photoCardScale: '2',
      });
    }
    const photoReady = textures.has(frame.index);
    const state = { ready: true, prepared, photoReady, availableCount, loadedCount: textures.size, totalCount: photos.length,
      index: frame.index, target: frame.next, busy: frame.busy || !photoReady,
      error: failed.size ? 'A photograph could not load. Earlier photographs remain available; refresh to retry.' : '' };
    const key = JSON.stringify(state);
    if (key !== previousState) { previousState = key; report(state); }
    draw();
  };
  report({ ready: false, prepared: false, photoReady: false, loadedCount: 0, totalCount: photos.length, index: 0, target: 0, busy: false, error: '' });
  const loader = new TextureLoader();
  const prepare = async () => {
    try { await warmup(); }
    catch (error) { if (!disposed) console.warn('Scene preparation deferred to first render.', error); }
    if (disposed) return;
    prepared = true;
    syncFrame();
  };
  // Each photo completes independently: the first ready one enables browsing.
  // Slow or failed later photos must never hold the entrance behind Promise.all.
  photos.forEach((photo, index) => { void loader.loadAsync(photo.image).then(texture => {
    if (disposed) { texture.dispose(); return; }
    texture.colorSpace = NoColorSpace;
    texture.flipY = true;
    texture.generateMipmaps = false;
    texture.minFilter = texture.magFilter = LinearFilter;
    textures.set(index, texture);
    if (!loaded && textures.has(0)) {
      uniforms.morphEnabled.value = 1;
      gallery = new CircularGallery({ scene, photos, textures, element });
      loaded = true;
      syncFrame();
      void prepare();
    } else if (loaded) gallery.setTexture(index, texture);
    syncFrame();
  }).catch(() => {
    if (disposed) return;
    failed.add(index);
    if (loaded) syncFrame();
    else report({ ready: false, prepared: false, photoReady: false, index: 0, target: 0, busy: false,
      error: 'A photograph could not load. Other photographs are still loading.' });
  }); });
  return {
    seek(value) { position = Math.max(0, Math.min(value, available())); syncFrame(); },
    project(camera) {
      if (!loaded || !visible || !coverMesh) return;
      const { bounds, depth } = projectCover(camera);
      const left = bounds.x, bottom = bounds.y, right = left + bounds.z, top = bottom + bounds.w;
      gallery.project(camera, bounds, depth);
      const stage = element.closest?.('.memory-stage');
      stage?.style.setProperty('--photo-drag-x', `${(left + right + 2) * 25}%`);
      stage?.style.setProperty('--photo-drag-y', `calc(${(1 - bottom) * 50}% + 35px)`);
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
