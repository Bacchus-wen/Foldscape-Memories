# Nature Memories — entrance and collection UI

Date: 2026-09-16

## Direction and references

The user's two images define one experience: a centered single-photo entrance,
then an editorial collection with left-aligned heading and controls below the stage.
Warm paper, Cormorant Garamond + Inter, slate text and one restrained red accent.
Keep actual photographs and all five model associations; no fabricated travel stories.

Research: [Minimal Gallery photography](https://minimal.gallery/tag/photography/),
[Rich Stapleton](https://minimal.gallery/rich-stapleton/),
[Lost Memories](https://minimal.gallery/lost-memories/).
The latter two are verified photography/gallery entries. Rich Stapleton's live page
exposes an image-led portfolio. These are direction references, not cloned motion.
Exa was rate-limited; built-in web search was used as fallback. The Lost Memories
live page and David Whyte case study could not be retrieved; no claims rely on them.

## Implementation plan

1. Separate photo gesture surface from navigation, so controls can live below the
   canvas. Preserve wheel, pointer, keyboard and partial-transfer availability.
2. Restyle entrance and collection headings; fade between them from the existing
   photo journey. Keep the canvas size stable through this transition, avoiding
   render-target reallocations. Preserve the existing 75% shrink and transmission.
3. Consolidate case title, playback, photo count/navigation and secondary actions.
   Provide responsive rows and 44px touch targets. Hide photo navigation while
   unfolding; keep rewind, orbit, original photo and sound available as before.
4. Run UI/state regressions, full tests, production build and preview bundle check.
   Attempt live visual verification; report connection failures explicitly.

## Tools and motion

- Skills: redesign-existing-projects (layout audit), brainstorming + writing-plans
  (scope and sequence), agent-reach (research), verification-before-completion.
- Existing Motion: heading opacity/translation on unfold and modal transitions.
  During photo browsing, the existing journey drives a sequential heading fade
  and 12px translation directly, so reverse scrolling restores the same state.
- Existing GSAP Observer + Timeline: photo wheel/drag and reversible photo journey.
- Existing Three.js Circular Gallery port + Morph Slider shader: unchanged.
- CSS: responsive grid, focus/hover/pressed feedback, reduced-motion support.
- No new library, font, asset download, particle layer or postprocessing pass.
- Removed the former hidden photo-thumbnail entrance and its Tilted Card spring;
  the original photograph is still available through the footer photo button.

## Validation

- The UI regression failed first because photo navigation was inside the stage.
  After relocation it passes, including five model entries, selected-photo opening,
  partial-transfer input, entrance discovery and hidden navigation while exploring.
- Full suite: 66 passed (6 focus, 4 hosting, 56 demo); final heading refinement
  received another passing UI regression. Production build passes; existing large
  chunk warning remains. Logs: `editorial-full-tests.log`, `editorial-ui-test.log`,
  `editorial-build.log`.
- Browser automation fails with `nodeRepl.fetch request failed`; static layout
  decisions are based on the user's images and code, not a successful live
  screenshot. Desktop/mobile visual review and perceived smoothness remain
  unverified; passing tests are not a substitute for them.
