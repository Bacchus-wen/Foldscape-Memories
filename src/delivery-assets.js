import assets from './delivery-assets.json' with { type: 'json' }

export default Object.fromEntries(Object.entries(assets).map(([id, url]) =>
  [id, `${import.meta.env?.BASE_URL ?? '/'}${url.slice(1)}`]))
