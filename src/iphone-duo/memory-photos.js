export const MEMORY_PHOTOS = [
  { id: 'lighthouse', image: '/scenes/lighthouse/reference.jpg', title: 'The lighthouse', detail: 'Red walls. Quiet water.', crop: [0, .5, 1, .5], scene: true },
  { id: 'iceberg', image: '/scenes/iceberg/source.png', title: 'Scarlet sails', detail: 'A quiet passage through ice.', crop: [0, .5, 1, .5], scene: true },
  { id: 'coastal-house', image: '/scenes/coastal-house/source.png', title: 'A quieter place', detail: 'A red roof by the sea.', crop: [0, .5, 1, .5], scene: true },
  { id: 'santorini', image: '/scenes/santorini/source.jpg', title: 'Blue over white', detail: 'Steps toward the Aegean.', crop: [0, .5, 1, .5], scene: true },
  { id: 'osaka-castle', image: '/scenes/osaka-castle/source.jpg', title: 'Crown of Osaka', detail: 'Green roofs. Enduring stone.', crop: [0, .473, 1, .527], scene: true },
];

// Values from the user's React Bits customizer screenshots and URL.
export const MORPH_SETTINGS = Object.freeze({
  duration: 1.1, ease: 'none', intensity: .95, scale: 4.9,
  aberration: .35, drift: .4, overlay: [5 / 255, 6 / 255, 10 / 255],
});
