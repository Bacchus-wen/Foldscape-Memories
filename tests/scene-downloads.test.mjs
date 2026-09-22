import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createSceneDownloads } from '../src/iphone-duo/diorama/scene-downloads.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture() {
  const calls = []
  const urls = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map(id => [id, `/${id}.glb`]))
  const store = createSceneDownloads(urls, (url, options) => new Promise((resolve, reject) => {
    const call = { url, ...options, resolve: bytes => resolve({ ok: true, arrayBuffer: async () => bytes }), reject }
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
    calls.push(call)
  }))
  return { store, calls }
}

test('initial download is isolated; background advances sequentially and reuses downloaded bytes', async () => {
  const { store, calls } = fixture()
  const first = store.load('a'), bytes = new ArrayBuffer(16)
  assert.equal(calls.length, 1)
  calls[0].resolve(bytes); assert.equal(await first, bytes)
  await tick(); assert.equal(calls.length, 1, 'do not race the entrance before background is enabled')
  store.startBackground(); assert.equal(calls.length, 2)
  assert.equal(calls[1].priority, 'low')
  for (let i = 1; i < 5; i++) {
    assert.equal(calls.length, i + 1, 'only one background request at a time')
    calls[i].resolve(new ArrayBuffer(i)); await tick()
  }
  assert.equal(await store.load('a'), bytes)
  assert.equal(calls.length, 5, 'revisiting a scene does not download it again')
  store.dispose()
})

test('jump starts a foreground request alongside background; duplicate selection shares it', async () => {
  const { store, calls } = fixture()
  const first = store.load('a'); calls[0].resolve(new ArrayBuffer(1)); await first; await tick()
  store.startBackground()
  const selected = store.load('e')
  assert.equal(calls[1].url, '/b.glb')
  assert.equal(calls[2].url, '/e.glb')
  assert.equal(calls[2].priority, 'high')
  assert.equal(calls[1].signal.aborted, false, 'jumping must not discard background progress')
  assert.equal(store.load('e'), selected)
  calls[2].resolve(new ArrayBuffer(5)); await selected; await tick()
  assert.equal(calls.length, 3, 'one unfinished background download is enough')
  calls[1].resolve(new ArrayBuffer(2)); await tick()
  assert.equal(calls[3].url, '/c.glb', 'background continues after the jump')
  store.dispose(); await tick()
})

test('rapid jumps stay within two active downloads and newest queued choice goes first', async () => {
  const { store, calls } = fixture()
  const a = store.load('a'), b = store.load('b'), c = store.load('c'), d = store.load('d')
  assert.equal(calls.length, 2)
  calls[0].resolve(new ArrayBuffer(1)); await a; await tick()
  assert.equal(calls[2].url, '/d.glb')
  calls[1].resolve(new ArrayBuffer(2)); await b; await tick()
  assert.equal(calls[3].url, '/c.glb')
  calls[2].resolve(new ArrayBuffer(4)); calls[3].resolve(new ArrayBuffer(3))
  await Promise.all([c, d]); store.dispose()
})

test('a failed background scene does not block the queue and can be retried on selection', async () => {
  const { store, calls } = fixture()
  store.startBackground(); calls[0].reject(new Error('offline')); await tick()
  assert.equal(calls[1].url, '/b.glb')
  const retry = store.load('a')
  assert.equal(calls[2].url, '/a.glb')
  calls[2].resolve(new ArrayBuffer(1)); await retry
  store.dispose(); await tick()
})

test('leaving cancels active/queued work and prevents retained downloads or new requests', async () => {
  const { store, calls } = fixture()
  const pending = [store.load('a'), store.load('b'), store.load('c')]
  const checks = pending.map(promise => assert.rejects(promise, { name: 'AbortError' }))
  store.dispose(); await Promise.all(checks); await tick()
  assert.ok(calls.every(call => call.signal.aborted))
  await assert.rejects(store.load('d'), { name: 'AbortError' })
  assert.equal(calls.length, 2)
})

test('real delivery files finish in the background and revisits make zero additional HTTP requests', { timeout: 15000 }, async () => {
  const manifest = JSON.parse(await readFile(new URL('../src/delivery-assets.json', import.meta.url)))
  delete manifest.device
  const files = new Map(await Promise.all(Object.values(manifest).map(async url =>
    [url, await readFile(new URL('../public' + url, import.meta.url))])))
  const requests = new Map()
  let finishRequests
  const allRequested = new Promise(resolve => { finishRequests = resolve })
  const server = createServer((req, res) => {
    const bytes = files.get(req.url)
    if (!bytes) { res.writeHead(404).end(); return }
    requests.set(req.url, (requests.get(req.url) ?? 0) + 1)
    res.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Content-Length': bytes.length }).end(bytes)
    if (requests.size === files.size) finishRequests()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const store = createSceneDownloads(Object.fromEntries(Object.entries(manifest).map(([id, url]) => [id, base + url])))
  try {
    await store.load('lighthouse')
    store.startBackground()
    await allRequested
    for (const [id, url] of Object.entries(manifest)) {
      const bytes = await store.load(id)
      assert.deepEqual(Buffer.from(bytes), files.get(url))
      assert.equal(await store.load(id), bytes)
    }
    assert.equal(requests.size, 5)
    assert.ok([...requests.values()].every(count => count === 1))
  } finally {
    store.dispose(); server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
