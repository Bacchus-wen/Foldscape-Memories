import { gsap } from 'gsap';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const CARD_WIDTH = .68, CARD_GAP = .24;
const sideCenter = distance => .5 + Math.sign(distance) * (.5 + CARD_GAP + CARD_WIDTH / 2 + (Math.abs(distance) - 1) * (CARD_WIDTH + CARD_GAP));

// 0→1: establish the collection. Each subsequent unit transfers one photograph.
export function samplePhotoJourney(value, count) {
  const position = clamp(value, 0, count), intro = clamp(position);
  const cursor = clamp(position - 1, 0, count - 1);
  const current = Math.max(0, Math.min(count - 2, Math.floor(cursor)));
  const next = Math.min(count - 1, current + 1), time = cursor - current;
  const transfer = clamp((time - .24) / .64);
  return { position, cursor, current, next, time, transfer,
    scale: 1.5 * (1 - .23 * smooth(intro)), reveal: smooth((intro - .28) / .72),
    index: transfer < .5 ? current : next, busy: time > .00001 && time < .99999 };
}

export function photoPlacement(index, frame) {
  const { current, next, time, reveal } = frame;
  // Keep both receiving edges aligned halfway through, even as queue spacing changes.
  const travel = smooth(time), edgeBias = 2 * (.5 - CARD_GAP - CARD_WIDTH / 2) * travel * (1 - travel);
  let center;
  if (index === current) {
    center = mix(.5, sideCenter(-1), travel) - edgeBias;
  } else if (index === next) {
    center = mix(sideCenter(1), .5, travel) + edgeBias;
  } else {
    center = mix(sideCenter(index - current), sideCenter(index - next), smooth(time));
  }
  if (index > 0) center += (1 - reveal) * 3;
  return { center, width: CARD_WIDTH };
}

export function createPhotoJourney({ count, onUpdate }) {
  const clock = { value: 0 };
  let tween, wanted = 0, disposed = false, paused = false;
  const publish = () => { if (!disposed) onUpdate(clock.value); };
  return {
    value: () => clock.value,
    target: () => wanted,
    seek(value, immediate = false, duration = 1.1) {
      if (disposed) return;
      wanted = clamp(value, 0, count);
      tween?.kill();
      if (immediate) { clock.value = wanted; publish(); }
      else if (duration < .4) tween = gsap.timeline({ paused }).to(clock, { value: wanted, duration, ease: 'power3.out', onUpdate: publish });
      else {
        const from = clock.value, distance = wanted - from;
        tween = gsap.timeline({ paused, onUpdate: publish })
          .addLabel('approach').to(clock, { value: from + distance * .24, duration: duration * .24, ease: 'power1.in' })
          .addLabel('receive-and-melt').to(clock, { value: from + distance * .88, duration: duration * .64, ease: 'none' })
          .addLabel('settle').to(clock, { value: wanted, duration: duration * .12, ease: 'power1.out' });
      }
    },
    stop() { tween?.kill(); wanted = clock.value; },
    setPaused(value) { paused = value; tween?.paused(value); },
    dispose() { disposed = true; tween?.kill(); },
  };
}
