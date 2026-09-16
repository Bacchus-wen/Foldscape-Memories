import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { samplePhotoJourney } from '../src/iphone-duo/photo-journey.js';
import { MEMORY_PHOTOS } from '../src/iphone-duo/memory-photos.js';

test('photo navigation remains available during a partial transfer and scene loading', async () => {
  const server = await createServer({ configFile: false, esbuild: { jsx: 'automatic' },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, ws: false }, ssr: { noExternal: ['gsap'] } });
  try {
    const { default: Experience } = await server.ssrLoadModule('/src/components/MemoryExperience.jsx');
    const props = {
      ready: false, phase: 'cover', fold: 0, progress: 0, photoCoverView: true,
      coverPhoto: { ready: true, index: 0, busy: true },
      photoJourney: { position: 1.4, frame: samplePhotoJourney(1.4, 5) },
      presets: [], sound: { volume: .5 }, zoom: 1,
    };
    const render = overrides => renderToStaticMarkup(React.createElement(Experience, { ...props, ...overrides }));
    const html = render();
    const footer = html.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '';
    assert.match(footer, /aria-label="Next photograph"/, 'photo navigation belongs below the scene, not over the screen');
    assert.match(footer, /aria-label="Photograph 1 of 5"/, 'the collection exposes its position');
    const entrance = render({ photoJourney: { position: 0, frame: samplePhotoJourney(0, 5) } });
    assert.match(entrance, /Scroll to discover/);
    assert.doesNotMatch(entrance.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '', /memory-stage-caption/, 'entrance omits case title and description');
    assert.doesNotMatch(entrance, /aria-label="Next photograph"/, 'entrance keeps photo browsing controls out of view');
    const scene = render({ phase: 'exploring', fold: 1, photoCoverView: false });
    assert.match(scene, /memory-photo-navigation[^>]*hidden/, 'photo controls leave with the photographs');
    assert.equal(html.match(/data-browsing="([^"]+)"/)?.[1], 'true', 'a transfer must not disable its own input');
    const next = html.match(/<button[^>]*aria-label="Next photograph"[^>]*>/)?.[0];
    assert.ok(next && !next.includes('disabled'), 'next photo remains actionable');
    assert.doesNotMatch(html.match(/<button[^>]*class="memory-primary"[^>]*>/)?.[0] ?? '', /disabled/, 'a request can finish the selected photo before unfolding');
    assert.match(render({ pendingPhotoOpen: true }), /class="memory-primary"[^>]*disabled/, 'a pending open cannot be queued twice');
    assert.deepEqual(MEMORY_PHOTOS.map(photo => photo.id), ['lighthouse', 'iceberg', 'coastal-house', 'santorini', 'osaka-castle']);
    for (const [index, photo] of MEMORY_PHOTOS.entries()) {
      assert.equal(photo.scene, true, `${photo.id} has a model`);
      const selected = render({ ready: true, coverPhoto: { ready: true, index, busy: false },
        photoJourney: { position: index + 1, frame: samplePhotoJourney(index + 1, MEMORY_PHOTOS.length) } });
      assert.match(selected, /aria-label="Open memory"/);
      assert.equal((selected.match(/aria-label="Photograph \d:/g) ?? []).length, 5);
      assert.ok(selected.includes(photo.title));
      assert.ok(!selected.includes('Returning to lighthouse'));
    }
    for (const state of [{ pendingPhotoOpen: true }, { photoCoverView: false }, { coverPhoto: { ready: false, index: 0 } }]) {
      assert.match(render(state), /data-browsing="false"/, 'loading / leaving the cover still blocks browsing');
    }
  } finally { await server.close(); }
});
