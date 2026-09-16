import { gsap } from 'gsap';
import { MORPH_SETTINGS } from './memory-photos.js';

// Finish the visible blend before serving the newest selection. Replacing its
// textures midway would jump to an image that was never actually on screen.
export function createPhotoTransition({ count, onFrame, onState, reduced = false }) {
  let current = 0, target = 0, wanted = 0, tween, disposed = false;
  const clock = { progress: 0 };
  const publish = busy => onState({ index: current, target: wanted, busy });
  const frame = () => onFrame({ current, target, progress: clock.progress });
  const start = () => {
    if (disposed || tween) return;
    target = wanted;
    if (target === current) { publish(false); return; }
    clock.progress = 0;
    frame();
    publish(true);
    tween = gsap.to(clock, {
      progress: 1, duration: reduced ? .15 : MORPH_SETTINGS.duration, ease: MORPH_SETTINGS.ease,
      onUpdate: frame,
      onComplete: () => {
        tween = undefined;
        current = target;
        clock.progress = 0;
        frame();
        if (wanted !== current) start();
        else publish(false);
      },
    });
  };
  return {
    select(index) {
      if (disposed) return;
      wanted = ((index % count) + count) % count;
      if (tween) publish(true);
      else start();
    },
    setReduced(value) { reduced = value; },
    setPaused(value) { tween?.paused(value); },
    dispose() { disposed = true; tween?.kill(); tween = undefined; },
  };
}
