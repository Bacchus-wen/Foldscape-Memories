# Startup and photo browsing fixes — 2026-09-16

## Reproduced causes

- The scene title had an animated hidden state but no initial state. Server rendering reproduced `<div class="memory-scene-heading" ...>` without opacity, allowing the left title to flash before Motion hid it.
- Photo journey ticks set React state at the App level every frame. This re-ran the page, phone updates and layout components for continuous movement.
- Each selected GLB synchronously baked and clipped all triangles at the hinge. Five delivered scenes required approximately 1–1.6 seconds each in a local Node geometry benchmark.
- Newly mounted scene roots started visible before the current fold state was applied. A closed phone could therefore submit the entire scene, water and shadows before asynchronous preparation, triggering synchronous shader compilation.
- Startup ran seven preparation poses. Water reflections also rendered the phone and gallery rather than only the natural scene.
- Wallpaper Studio preset images were preloaded and its AI worker was started even when the entry view was Memory.

## Changes

- Initialize scene-heading opacity from its current animation state; preload the three primary Latin font files in HTML.
- Use a MotionValue for the continuous gallery clock, heading crossfade and camera framing. React refreshes at caption/control/layout boundaries. GSAP Observer and Timeline retain control of wheel, drag and reversible transitions.
- Move the existing geometry algorithm, including current waterline handling, into a module worker. Transfer typed buffers; preserve real materials and textures on the main thread. The algorithm and source GLBs are unchanged.
- Apply the last fold state before rendering newly mounted assets. Debounce scene changes by 250 ms so fast navigation skips intermediate requests.
- Prepare the terrain-visible/no-lantern and fully-open/lit poses. Scene swaps wait for outstanding GPU compilation before disposing materials; leaving the page stops drawing immediately and releases those materials once compilation exits.
- Restrict water reflection cameras to the natural scene and its lights, excluding the phone and photograph gallery. Keep both water planes and their actual architectural reflections.
- Defer wallpaper preset preloading until that view is entered; create its AI worker only on an actual depth-generation request.

## Geometry benchmark

Delivered GLB geometry, textures stripped for the Node-only benchmark. These are single local samples, not network or GPU measurements. Worker wall time includes startup, compute and transfer; the expensive computation is moved rather than eliminated.

| Scene | Previous synchronous prepare | New main-thread transfer + restore | Worker preparation wall time |
| --- | ---: | ---: | ---: |
| Lighthouse | 1,438 ms | 29 ms | 1,492 ms |
| Iceberg | 1,584 ms | 14 ms | 1,376 ms |
| Coastal house | 1,057 ms | 8 ms | 1,076 ms |
| Santorini | 1,496 ms | 12 ms | 1,191 ms |
| Osaka castle | 1,306 ms | 8 ms | 1,285 ms |

The new main-thread column excludes GLTF parsing, image decoding, material setup and rendering.

## Verification

- Regression test first failed on the missing initial title opacity, then passed.
- Worker tests preserve geometry bounds, material identity, lights and reversible folding through transferable buffers. A real worker test verifies that the main event loop remains responsive while processing geometry.
- Reflection test verifies that the phone/gallery layer is excluded and the architecture layer included.
- `npm test`: 74 tests passed (6 focus, 4 hosting, 64 demo).
- `npm run test:scene-layout`: 21 passed; overlaps the main suite.
- Production build passed. Existing large main-JavaScript chunk warning remains.
- Chrome through CUA: inspected entry, gallery controls and all five model endpoints using playback/progress controls; console inspection returned no warnings/errors during those checks.
- Final-build view switch during startup: Wallpaper Studio contained one canvas and zero Memory page roots; returning to Memory worked without console warnings/errors. A separate regression test verifies delayed resource disposal and suppression of late ready callbacks when leaving during compilation.
- After restricting reflection layers, the observed lighthouse endpoint submitted 144 draw calls versus 232 before the change, retaining the architecture reflection. Its shader program count stayed at the 60 prepared programs through the checked opening sequence. These counts describe rendering work, not FPS.

Chrome startup preparation read 26,407 ms on the initial pre-fix visit. Intermediate repaired builds read approximately 3,049–3,111 ms on reload; the final reflection-limited build recorded 1,143 ms on a subsequent reload. The browser shader and asset caches had changed, so these are diagnostic observations, **not a controlled cold-start speedup claim**. First asset download and first driver compilation still take time. Frame-interval readings during tool-driven browser interaction included long idle/throttled gaps and are not used to claim a sustained FPS.

Tools used: local code inspection and Node tests/benchmarks; actual module workers; GSAP; Motion; Three.js; Chrome CUA visual checks. No new package or external asset download.
