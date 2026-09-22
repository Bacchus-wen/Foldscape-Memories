// Retain compressed GLB bytes only. Background work never decodes textures or
// uploads inactive models to the GPU. The five known URLs bound cache growth.
export function createSceneDownloads(urls, request = globalThis.fetch) {
  const jobs = new Map(), active = new Set(), failed = new Set()
  let background = false, disposed = false, order = 0
  const closed = () => new DOMException('Scene downloads disposed', 'AbortError')

  function create(id, foreground) {
    let resolve, reject
    const promise = new Promise((yes, no) => { resolve = yes; reject = no })
    const job = { id, foreground, order: ++order, state: 'queued', promise, resolve, reject, controller: new AbortController() }
    jobs.set(id, job)
    if (!foreground) promise.catch(() => {})
    return job
  }

  async function run(job) {
    job.state = 'loading'; active.add(job)
    try {
      const response = await request(urls[job.id], {
        signal: job.controller.signal, priority: job.foreground ? 'high' : 'low',
      })
      if (!response.ok) throw new Error(`Scene download failed: ${job.id} (${response.status})`)
      const bytes = await response.arrayBuffer()
      if (disposed) throw closed()
      job.state = 'ready'; job.resolve(bytes)
    } catch (error) {
      jobs.delete(job.id); failed.add(job.id); job.reject(error)
    } finally {
      active.delete(job); pump()
    }
  }

  function pump() {
    if (disposed) return
    // A selection may join the single background transfer without restarting
    // it. Cap total concurrency at two even during rapid repeated selections.
    const waiting = [...jobs.values()].filter(job => job.state === 'queued' && job.foreground)
      .sort((a, b) => b.order - a.order)
    while (active.size < 2 && waiting.length) void run(waiting.shift())
    if (background && active.size === 0) {
      const next = Object.keys(urls).find(id => !jobs.has(id) && !failed.has(id))
      if (next) void run(create(next, false))
    }
  }

  return {
    load(id) {
      if (disposed) return Promise.reject(closed())
      if (!Object.hasOwn(urls, id)) return Promise.reject(new Error(`Unknown scene: ${id}`))
      failed.delete(id)
      const job = jobs.get(id) ?? create(id, true)
      job.foreground = true; job.order = ++order
      pump()
      return job.promise
    },
    startBackground() { background = true; pump() },
    dispose() {
      disposed = true
      for (const job of jobs.values()) {
        if (job.state !== 'ready') { job.reject(closed()); job.controller.abort(closed()) }
      }
      jobs.clear(); active.clear(); failed.clear()
    },
  }
}
