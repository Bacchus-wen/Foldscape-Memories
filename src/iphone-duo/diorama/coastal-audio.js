const FADE_SECONDS = .18
const SUSPEND_DELAY_MS = 260

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function schedule(param, value, context, seconds = FADE_SECONDS) {
  const now = context.currentTime
  param.cancelScheduledValues(now)
  param.setValueAtTime(param.value, now)
  param.setTargetAtTime(value, now, Math.max(.001, seconds / 3))
}

function noiseSource(context, duration, filterType, frequency) {
  const length = Math.max(1, Math.floor(context.sampleRate ? context.sampleRate * duration : 44100 * duration))
  const buffer = context.createBuffer(1, length, context.sampleRate || 44100)
  const data = buffer.getChannelData(0)
  let previous = 0
  for (let index = 0; index < data.length; index += 1) {
    const white = Math.random() * 2 - 1
    previous = previous * .94 + white * .06
    data[index] = previous
  }
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  source.buffer = buffer
  source.loop = true
  filter.type = filterType
  filter.frequency.value = frequency
  source.connect(filter)
  source.start()
  return { source, filter }
}

function createGraph(context) {
  const master = context.createGain(); master.label = 'master'; master.gain.value = 0
  const volume = context.createGain(); volume.label = 'volume'; volume.gain.value = .55
  const coast = context.createGain(); coast.label = 'coast'; coast.gain.value = 0
  const music = context.createGain(); music.label = 'music'; music.gain.value = 0
  coast.connect(volume); music.connect(volume); volume.connect(master); master.connect(context.destination)

  const wind = noiseSource(context, 3.7, 'lowpass', 900)
  const water = noiseSource(context, 2.3, 'bandpass', 520)
  wind.filter.Q.value = .35; water.filter.Q.value = .7
  wind.filter.connect(coast); water.filter.connect(coast)

  const voices = [110, 164.81, 220].map((frequency, index) => {
    const oscillator = context.createOscillator()
    const voice = context.createGain()
    const lfo = context.createOscillator()
    const lfoDepth = context.createGain()
    oscillator.type = index === 1 ? 'triangle' : 'sine'
    oscillator.frequency.value = frequency
    voice.gain.value = [.018, .012, .008][index]
    lfo.type = 'sine'
    lfo.frequency.value = [.031, .023, .017][index]
    lfoDepth.gain.value = [.005, .004, .003][index]
    oscillator.connect(voice); voice.connect(music); oscillator.start()
    lfo.connect(lfoDepth); lfoDepth.connect(voice.gain); lfo.start()
    return { oscillator, voice, lfo, lfoDepth }
  })
  return {
    master, volume, coast, music,
    sources: [wind.source, water.source, ...voices.flatMap(({ oscillator, lfo }) => [oscillator, lfo])],
    nodes: [wind.filter, water.filter, ...voices.flatMap(({ voice, lfoDepth }) => [voice, lfoDepth]), coast, music, volume, master],
  }
}

export function createCoastalAudio({
  AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
  onError = () => {},
} = {}) {
  let context
  let graph
  let disposed = false
  let coast = false
  let music = false
  let coastVersion = 0
  let musicVersion = 0
  let volume = .55
  let environment = { active: false, fold: 0, rewinding: false, hidden: false }
  let suspendTimer

  const audible = () => environment.active && !environment.rewinding && !environment.hidden && environment.fold > 0 && (coast || music)
  const cancelSuspend = () => { if (suspendTimer !== undefined) clearTimeoutFn(suspendTimer); suspendTimer = undefined }

  async function sync() {
    if (!context || !graph || disposed) return
    cancelSuspend()
    if (audible() && context.state === 'suspended') await context.resume()
    if (disposed || !graph) return
    const shouldPlay = audible()
    schedule(graph.coast.gain, coast ? 1 : 0, context)
    schedule(graph.music.gain, music ? 1 : 0, context)
    schedule(graph.volume.gain, volume, context)
    schedule(graph.master.gain, shouldPlay ? clamp01(environment.fold) : 0, context)
    if (!shouldPlay && context.state === 'running') {
      const expectedContext = context
      suspendTimer = setTimeoutFn(() => {
        suspendTimer = undefined
        if (!disposed && context === expectedContext && !audible() && expectedContext.state === 'running') expectedContext.suspend().catch(() => {})
      }, SUSPEND_DELAY_MS)
    }
  }

  const syncInBackground = () => sync().catch(error => { if (!disposed) onError(error) })

  async function ensureContext() {
    if (disposed) return
    if (!AudioContextClass) throw new Error('Web Audio is not supported in this browser.')
    if (!context) {
      context = new AudioContextClass()
      graph = createGraph(context)
    }
    if (context.state === 'suspended') await context.resume()
  }

  return {
    hasContext: () => Boolean(context),
    async setCoast(enabled) {
      const version = ++coastVersion
      coast = Boolean(enabled)
      try { if (coast) await ensureContext(); await sync() }
      catch (error) {
        if (version === coastVersion) { coast = false; await sync().catch(() => {}) }
        throw error
      }
    },
    async setMusic(enabled) {
      const version = ++musicVersion
      music = Boolean(enabled)
      try { if (music) await ensureContext(); await sync() }
      catch (error) {
        if (version === musicVersion) { music = false; await sync().catch(() => {}) }
        throw error
      }
    },
    setVolume(value) { volume = clamp01(value); return syncInBackground() },
    setEnvironment(next) { environment = { ...environment, ...next, fold: clamp01(next.fold ?? environment.fold) }; return syncInBackground() },
    async dispose() {
      if (disposed) return
      disposed = true
      cancelSuspend()
      const closing = context
      if (graph) {
        for (const source of graph.sources) { try { source.stop() } catch {}; source.disconnect() }
        for (const node of graph.nodes) node.disconnect()
      }
      context = undefined; graph = undefined
      if (closing && closing.state !== 'closed') await closing.close()
    },
  }
}
