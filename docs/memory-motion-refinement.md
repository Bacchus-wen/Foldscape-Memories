# Memory entry, unfolding and canvas refinement

2026-09-16

## Findings

- Browsing was gated by `coverPhoto.ready`, which was only published after seven
  GPU warmup poses. This coupled photo input to 3D preparation.
- External photos used a boolean tied to the `cover` phase. Starting playback
  immediately hid the gallery instead of moving it into the device.
- The WebGL canvas occupied only the middle editorial rectangle. Geometry above
  that rectangle was clipped, regardless of available whitespace on the page.
- The footer changed CSS grid at the intro boundary without a layout transition.

## Changes

- Publish photo readiness before GPU preparation; retain a separate `prepared`
  flag for unfolding. A click while preparing queues the selected memory.
  Preparation yields to the browser between passes. Scene replacement waits for
  a current compilation pass to release its materials; only the latest selected
  scene is then mounted. This is an input-unblocking change, not a measured claim
  that total initial model loading takes a particular number of seconds.
- Opening and rewind use the same shortened clock: **5400 → 4320 ms**. The initial
  closed hold is **400 → 320 ms**, now used to retract the surrounding photographs.
  The separate 1100 ms return from an arbitrary device pose remains unchanged.
- Cards contract toward the screen center, shrink slightly, retain local Melt
  deformation, and disappear through the existing 20 CSS px reception mask.
  Rewind reverses the same progress; no separate timer or delayed hide is used.
- Browse framing becomes **77%** of entrance framing (previously 75%).
- The canvas fills the page. A camera view offset preserves the former device
  scale and position while allowing tall scenery to render outside the old frame.
  Existing 60 Hz draw budget and two-million-pixel cap remain in force.
- Motion layout transitions connect footer positions over 650 ms. Entrance copy
  appears over 1.4 s with small staggered delays; reduced motion disables this.
  The entrance omits the case title and subtitle. They remain in collection and
  model views. The original photo dialog and all five cases remain available.

## Tools

Systematic debugging for cause tracing; existing React, Motion, GSAP Observer and
Timeline, Three.js view offsets, Circular Gallery port and Morph Slider-derived
card deformation. No new dependency, download, generated asset or rendering layer.

## Verification

- Red-first regressions reproduced warmup blocking, the old 75% scale and 5400 ms
  duration. Updated tests cover browsing during warmup, shared open/rewind timing,
  monotonic card retraction, reversible positions, same-size camera projection,
  geometry above the former crop, and the missing entrance caption.
- Full tests: 70 passed (6 focus, 4 hosting, 60 demo).
- Browser connection failed again with `nodeRepl.fetch request failed`. Live
  Chrome startup latency and visual smoothness have not been measured. The
  screenshot supplied by the user is evidence of the old crop, not verification
  of the new runtime.
- Logs: `motion-revision-red.log`, `motion-revision-tests.log`,
  `motion-revision-full-tests.log`, `motion-revision-build.log`.
