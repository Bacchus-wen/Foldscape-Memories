import photoAssets from '../photo-assets.js';

export const MEMORY_PHOTOS = [
  { id: 'lighthouse', image: '/scenes/lighthouse/reference.jpg', title: 'Round Island Light', detail: 'Red walls. Quiet water.', crop: [0, .5, 1, .5], scene: true },
  { id: 'iceberg', image: photoAssets.iceberg, title: 'A Red Sailboat in western Greenland', detail: 'A quiet passage through ice.', crop: [0, .5, 1, .5], scene: true },
  { id: 'coastal-house', image: photoAssets['coastal-house'], title: 'Kálfeyri', detail: 'Skötufjörður, Ísafjarðardjúp.', crop: [0, .5, 1, .5], scene: true },
  { id: 'santorini', image: '/scenes/santorini/source.jpg', title: 'Santorini in Blue and White', detail: 'Steps toward the Aegean.', crop: [0, .5, 1, .5], scene: true },
  { id: 'osaka-castle', image: '/scenes/osaka-castle/source.jpg', title: 'Osaka Castle', detail: 'Green roofs. Enduring stone.', crop: [0, .473, 1, .527], scene: true },
];

// Values from the user's React Bits customizer screenshots and URL.
export const MORPH_SETTINGS = Object.freeze({
  duration: 1.1, ease: 'none', intensity: .95, scale: 4.9,
  aberration: .35, drift: .4, overlay: [5 / 255, 6 / 255, 10 / 255],
});
