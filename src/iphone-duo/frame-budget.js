// Keep animation clocks continuous while avoiding redundant draws on 120–240 Hz displays.
export function createFrameBudget(fps = 60) {
  const interval = 1000 / fps;
  let next;
  return time => {
    if (next === undefined || time - next > interval) {
      next = time + interval;
      return true;
    }
    if (time + .5 < next) return false;
    next += interval;
    return true;
  };
}

// Bound GPU pixel work independently of window size / OS display scaling.
export function scenePixelRatio(width, height, deviceRatio) {
  return Math.min(deviceRatio, 1.5, Math.sqrt(2_000_000 / Math.max(1, width * height)));
}
