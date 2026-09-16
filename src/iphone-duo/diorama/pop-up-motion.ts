import { foldChoreography } from '../fold-choreography.ts'

export type PopUpState = { terrain: number; cabins: number; lighthouse: number }
const ease = (start: number, end: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)))
  return t * t * (3 - 2 * t)
}
export function getPopUpState(progress: number): PopUpState {
  const angle = foldChoreography(progress).hinge * 180
  return {
    terrain: ease(12, 85, angle),
    cabins: ease(38, 115, angle),
    lighthouse: ease(55, 145, angle),
  }
}
