export const FOLD_DURATION = 2
export const HINGE_PHASE = 0.96

// Zero velocity and acceleration at both ends: scrubbing and reversing use
// exactly the same focus state without a separate, delayed focus animation.
function focusEase(start: number, end: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

export function progressToOpeningAngle(progress: number) {
  return Math.round(Math.min(1, Math.max(0, progress) / HINGE_PHASE) * 180)
}

export function openingAngleToProgress(angle: number) {
  return angle >= 180 ? 1 : Math.max(0, angle / 180) * HINGE_PHASE
}

export function foldChoreography(progress: number) {
  const p = Math.max(0, Math.min(1, progress))
  const hinge = Math.min(1, p / HINGE_PHASE)
  return {
    hinge,
    angle: (1 - hinge) * Math.PI,
    coverFocusEdge: 1.25 - focusEase(0, 0.52, p) * 1.4,
    // Recover while the hinge is still moving, then settle over the last 4%.
    // Previously the entire cover jumped into focus in just that final 4%.
    // Ease from the closed endpoint so defocus is already perceptible near
    // 10°; the former delayed gate kept the first ~20° visually too sharp.
    coverDefocus: focusEase(0, 0.30, p) * (1 - focusEase(0.56, 1, p)),
    innerFocusEdge: 0.5 - focusEase(0.48, 1, p) * 0.72,
    innerDefocus: 1 - focusEase(0.42, 1, p),
    // The revealed inner panel starts in shadow, then reaches normal display
    // luminance as it opens. Values are linear-light, not opacity over white.
    innerBrightness: 0.08 + 0.92 * focusEase(0.16, 0.94, p),
    // Subtle wallpaper-only drift in display UVs. Inner content eases into its
    // final framing; the cover returns to neutral at both visible endpoints.
    innerWallpaperShift: 0.022 * (1 - focusEase(0.14, HINGE_PHASE, p)),
    coverWallpaperShift: -0.016 * focusEase(0, 0.5, p) * (1 - focusEase(0.5, 1, p)),
    // Foreground UI settles from a separate depth plane. Keep the motion tied
    // to fold progress so reversing or scrubbing does not restart an entrance.
    innerContentShift: 0.045 * (1 - focusEase(0.16, 0.94, p)),
    coverContentShift: -0.008 * focusEase(0.04, 0.5, p) * (1 - focusEase(0.5, 1, p)),
  }
}
