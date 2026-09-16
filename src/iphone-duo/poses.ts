// Opening targets follow Apple's product-viewer pose configuration (PT_*).
// Rotation is expressed after the Apple XZ rig is normalized into XY.
export const POSES = [
  { id: 'foldable', label: 'Foldable', fold: 0.3333 * 0.96, orientation: 0, rotation: { x: 0, y: -6, z: 0 } },
  { id: 'landscape', label: 'Landscape', fold: 1, orientation: 0, rotation: { x: 0, y: 0, z: 0 } },
  { id: 'portrait', label: 'Portrait', fold: 1, orientation: Math.PI / 2, rotation: { x: 0, y: 0, z: -90 } },
  { id: 'closed', label: 'Closed', fold: 0, orientation: 0, rotation: { x: 0, y: 0, z: 0 } },
  { id: 'tabletop', label: 'Seated', fold: 0.5111 * 0.96, orientation: Math.PI / 2, rotation: { x: -72, y: 0, z: -90 } },
  { id: 'standing', label: 'Standing', fold: 0.25 * 0.96, orientation: Math.PI / 2, rotation: { x: -18, y: -28, z: -90 } },
  { id: 'durable', label: 'Durability', fold: 0.3333 * 0.96, orientation: 0, rotation: { x: -12, y: 117, z: 0 } },
];
