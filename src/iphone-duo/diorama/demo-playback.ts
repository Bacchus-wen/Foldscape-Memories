export function getDemoLoop() {
  return {
    keyframes: [0,0,1,1,0],
    duration:14, times:[0,.15,.5,.76,1], ease:'easeInOut' as const, repeat:Infinity,
  }
}
