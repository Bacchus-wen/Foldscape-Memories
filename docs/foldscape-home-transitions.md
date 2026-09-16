# Foldscape Memories — identity and home transitions

- Renamed the header, accessible home control, static page title and scene titles.
- Replaced the two crossfading titles with one visible heading. Hidden layout measurements define responsive endpoints; the existing GSAP-driven gallery MotionValue updates word transforms directly, without per-frame React renders. Font readiness and resize refresh those measurements.
- Home rotation now grows the device to the entrance scale and retracts the gallery using Motion animation and the existing Three.js cover gallery. The selected photograph is retained; an interrupted morph settles on the selected photograph.
- Downward wheel input returns the device to its closed front pose over 1.1 seconds, restores the 77% collection scale and reveals the gallery. Home wheel handling remains separate from scene zoom. Model exploration keeps its existing zoom behavior.
- Pointer clicks alone do not enter rotation mode; movement must exceed the existing drag threshold.

Validation: production build; npm test (74 tests); Chrome home/collection heading positions, rotate → wheel return → photo navigation, selected case preservation. No new dependencies.
