import test from 'node:test'
import assert from 'node:assert/strict'
import { Scene, Texture, TextureLoader } from 'three'
import { createCoverMorph, createMorphUniforms } from '../src/iphone-duo/cover-morph.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
const texture = () => new Texture({ width: 160, height: 100 })

test('out-of-order photos never substitute for missing photos or move the selected scene', async () => {
  const original = TextureLoader.prototype.loadAsync
  const pending = [], states = [], scene = new Scene()
  let finishWarmup
  const warmup = new Promise(resolve => { finishWarmup = resolve })
  TextureLoader.prototype.loadAsync = () => new Promise((resolve, reject) => pending.push({ resolve, reject }))
  const uniforms = createMorphUniforms()
  const morph = createCoverMorph({ material: { uniforms }, photos: Array.from({ length: 5 }, (_, i) => ({ image: `${i}.jpg`, crop: [0, 0, 1, 1] })),
    scene, draw() {}, onState: state => states.push(state), warmup: () => warmup })
  try {
    pending[2].resolve(texture()); await tick()
    assert.equal(states.at(-1).ready, false, 'later photo cannot replace the initial lighthouse')
    pending[0].resolve(texture()); await tick()
    assert.equal(states.at(-1).ready, true, 'one ready image must enable the gallery')
    assert.equal(states.at(-1).prepared, false, 'model preparation may continue separately')
    assert.equal(states.at(-1).photoReady, true)
    morph.seek(1)
    assert.equal(states.at(-1).busy, false, 'unloaded next image must not block the current one')
    morph.seek(3)
    assert.equal(states.at(-1).index, 0, 'missing second image stops travel at the first image')
    assert.equal(states.at(-1).availableCount, 1)
    assert.equal(states.at(-1).photoReady, true)
    pending[3].reject(new Error('one photo offline')); await tick()
    assert.match(states.at(-1).error, /photograph/i)
    pending[1].resolve(texture()); await tick()
    assert.equal(states.at(-1).index, 0, 'arrival does not replay an old scroll request')
    assert.equal(states.at(-1).availableCount, 3)
    morph.seek(3)
    assert.equal(states.at(-1).index, 2)
    morph.seek(1)
    finishWarmup(); await tick()
    assert.equal(states.at(-1).prepared, true)
  } finally {
    morph.dispose(); finishWarmup(); TextureLoader.prototype.loadAsync = original
    for (const job of pending.slice(3)) job.resolve(texture())
    await tick()
  }
})

test('late photos are released after leaving and never publish stale readiness', async () => {
  const original = TextureLoader.prototype.loadAsync, pending = [], states = []
  TextureLoader.prototype.loadAsync = () => new Promise(resolve => pending.push(resolve))
  const morph = createCoverMorph({ material: { uniforms: createMorphUniforms() },
    photos: [0, 1].map(i => ({ image: `${i}.jpg`, crop: [0, 0, 1, 1] })),
    scene: new Scene(), draw() {}, onState: state => states.push(state), warmup: async () => {} })
  try {
    morph.dispose(); const count = states.length
    let released = 0
    for (const resolve of pending) { const image = texture(); image.addEventListener('dispose', () => released++); resolve(image) }
    await tick()
    assert.equal(released, 2); assert.equal(states.length, count)
  } finally { TextureLoader.prototype.loadAsync = original }
})
