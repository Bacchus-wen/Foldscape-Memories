import test from 'node:test'
import assert from 'node:assert/strict'

import { createCoastalAudio } from '../src/iphone-duo/diorama/coastal-audio.js'
import { createAudioChannelUpdater, formatMemoryAudioError } from '../src/iphone-duo/diorama/use-memory-audio.js'

class FakeParam {
  constructor(value = 0) { this.value = value; this.events = [] }
  cancelScheduledValues(time) { this.events.push(['cancel', time]) }
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]) }
  setTargetAtTime(value, time, constant) { this.value = value; this.events.push(['target', value, time, constant]) }
}

class FakeNode {
  constructor(kind) { this.kind = kind; this.connections = []; this.gain = new FakeParam(); this.frequency = new FakeParam(); this.Q = new FakeParam() }
  connect(node) { this.connections.push(node); return node }
  disconnect() { this.disconnected = true }
  start() { this.started = true }
  stop() { this.stopped = true }
}

class FakeAudioContext {
  static instances = []
  static resumeFactory
  constructor() { this.currentTime = 4; this.state = 'suspended'; this.destination = new FakeNode('destination'); this.nodes = []; FakeAudioContext.instances.push(this) }
  node(kind) { const node = new FakeNode(kind); this.nodes.push(node); return node }
  createGain() { return this.node('gain') }
  createBiquadFilter() { return this.node('filter') }
  createBufferSource() { return this.node('buffer-source') }
  createOscillator() { return this.node('oscillator') }
  createBuffer(channels, length, sampleRate) { return { channels, length, sampleRate, getChannelData: () => new Float32Array(length) } }
  resume() { this.resumeCalls = (this.resumeCalls || 0) + 1; return FakeAudioContext.resumeFactory ? FakeAudioContext.resumeFactory(this) : (this.state = 'running', Promise.resolve()) }
  suspend() { this.state = 'suspended'; this.suspendCalls = (this.suspendCalls || 0) + 1; return Promise.resolve() }
  close() { this.state = 'closed'; this.closeCalls = (this.closeCalls || 0) + 1; return Promise.resolve() }
}

function fixture() {
  FakeAudioContext.instances.length = 0
  FakeAudioContext.resumeFactory = undefined
  const timers = []
  const audio = createCoastalAudio({
    AudioContextClass: FakeAudioContext,
    setTimeoutFn(callback) { timers.push(callback); return timers.length },
    clearTimeoutFn() {},
  })
  return { audio, timers }
}

test('a pending resume cannot restore sound after a rapid disable', async () => {
  FakeAudioContext.instances.length = 0
  let resolveResume
  let resumes = 0
  FakeAudioContext.resumeFactory = context => {
    resumes += 1
    if (resumes === 1) { context.state = 'running'; return Promise.resolve() }
    return new Promise(resolve => { resolveResume = () => { context.state = 'running'; resolve() } })
  }
  const errors = []
  const audio = createCoastalAudio({ AudioContextClass: FakeAudioContext, onError: error => errors.push(error) })
  audio.setEnvironment({ active: true, fold: 1, rewinding: false, hidden: false })
  await audio.setCoast(true)
  const context = FakeAudioContext.instances[0]
  context.state = 'suspended'
  const resuming = audio.setEnvironment({ hidden: false })
  await Promise.resolve()
  await audio.setCoast(false)
  resolveResume()
  await resuming
  assert.equal(context.nodes.find(node => node.label === 'master').gain.value, 0)
  assert.deepEqual(errors, [])
})

test('environment resume failures are reported and a failed enable rolls back engine state', async () => {
  FakeAudioContext.instances.length = 0
  const errors = []
  let attempts = 0
  FakeAudioContext.resumeFactory = context => {
    attempts += 1
    if (attempts === 1) { context.state = 'running'; return Promise.resolve() }
    return Promise.reject(new Error('Audio permission was denied.'))
  }
  const audio = createCoastalAudio({ AudioContextClass: FakeAudioContext, onError: error => errors.push(formatMemoryAudioError(error)) })
  audio.setEnvironment({ active: true, fold: 1, rewinding: false, hidden: false })
  await audio.setCoast(true)
  const context = FakeAudioContext.instances[0]
  context.state = 'suspended'
  await audio.setEnvironment({ hidden: false })
  assert.deepEqual(errors, ['Sound could not be started: Audio permission was denied.'])

  context.state = 'suspended'
  await assert.rejects(audio.setMusic(true), /Audio permission was denied/)
  context.state = 'running'
  await audio.setEnvironment({ fold: .8 })
  assert.equal(context.nodes.find(node => node.label === 'music').gain.value, 0)
})

for (const channel of ['coast', 'music']) {
  test(`a stale failed ${channel} enable cannot override a newer successful enable`, async () => {
    FakeAudioContext.instances.length = 0
    const pending = []
    let resumes = 0
    FakeAudioContext.resumeFactory = context => {
      resumes += 1
      if (resumes === 2) { context.state = 'running'; return Promise.resolve() }
      return new Promise((resolve, reject) => pending.push({ context, resolve, reject }))
    }
    const audio = createCoastalAudio({ AudioContextClass: FakeAudioContext })
    audio.setEnvironment({ active: true, fold: 1, rewinding: false, hidden: false })
    const states = { coast: false, music: false }
    let visibleError = ''
    const updater = createAudioChannelUpdater({
      getEngine: () => audio,
      onState: (kind, enabled) => { states[kind] = enabled },
      onError: error => { visibleError = formatMemoryAudioError(error) },
      onClearError: () => { visibleError = '' },
    })
    const first = updater.update(channel, true)
    await Promise.resolve()
    await updater.update(channel, false)
    const latest = updater.update(channel, true)
    await latest
    pending[0].reject(new Error('Late denial'))
    await first
    const context = FakeAudioContext.instances[0]
    assert.equal(states[channel], true)
    assert.equal(visibleError, '')
    assert.equal(context.nodes.find(node => node.label === channel).gain.value, 1)
  })
}

test('does not create an audio context until a sound is enabled by a user call', async () => {
  const { audio } = fixture()
  audio.setEnvironment({ active: true, fold: 1, rewinding: false, hidden: false })
  audio.setVolume(.7)
  assert.equal(FakeAudioContext.instances.length, 0)
  await audio.setCoast(true)
  assert.equal(FakeAudioContext.instances.length, 1)
  assert.equal(FakeAudioContext.instances[0].state, 'running')
})

test('routes coast and music through independent gains', async () => {
  const { audio } = fixture()
  audio.setEnvironment({ active: true, fold: 1, rewinding: false, hidden: false })
  await audio.setCoast(true)
  const context = FakeAudioContext.instances[0]
  const coastGain = context.nodes.find(node => node.label === 'coast')
  const musicGain = context.nodes.find(node => node.label === 'music')
  assert.equal(coastGain.gain.value, 1)
  assert.equal(musicGain.gain.value, 0)
  await audio.setMusic(true)
  assert.equal(coastGain.gain.value, 1)
  assert.equal(musicGain.gain.value, 1)
  await audio.setCoast(false)
  assert.equal(coastGain.gain.value, 0)
  assert.equal(musicGain.gain.value, 1)
})

test('builds slow modulators so the ambient score changes over time', async () => {
  const { audio } = fixture()
  await audio.setMusic(true)
  const oscillators = FakeAudioContext.instances[0].nodes.filter(node => node.kind === 'oscillator')
  assert.equal(oscillators.length, 6)
  assert.ok(oscillators.every(node => node.started))
})

test('fades the master with fold and mutes while inactive, rewinding, or hidden', async () => {
  const { audio, timers } = fixture()
  audio.setEnvironment({ active: true, fold: .4, rewinding: false, hidden: false })
  await audio.setCoast(true)
  const context = FakeAudioContext.instances[0]
  const master = context.nodes.find(node => node.label === 'master')
  assert.equal(master.gain.value, .4)
  audio.setEnvironment({ active: true, fold: 1, rewinding: true, hidden: false })
  assert.equal(master.gain.value, 0)
  timers.at(-1)()
  assert.equal(context.suspendCalls, 1)
  await audio.setEnvironment({ active: true, fold: .75, rewinding: false, hidden: false })
  assert.equal(context.resumeCalls, 2)
  assert.equal(master.gain.value, .75)
  audio.setEnvironment({ active: false, fold: 1, rewinding: false, hidden: false })
  assert.equal(master.gain.value, 0)
})

test('clamps volume, disposes every source, and closes exactly once', async () => {
  const { audio } = fixture()
  audio.setEnvironment({ active: true, fold: 1, rewinding: false, hidden: false })
  await audio.setMusic(true)
  audio.setVolume(2)
  const context = FakeAudioContext.instances[0]
  const volume = context.nodes.find(node => node.label === 'volume')
  assert.equal(volume.gain.value, 1)
  await audio.dispose()
  await audio.dispose()
  assert.equal(context.closeCalls, 1)
  assert.ok(context.nodes.filter(node => node.kind === 'oscillator').every(node => node.stopped && node.disconnected))
})

test('reports unsupported audio without creating partial state', async () => {
  const audio = createCoastalAudio({ AudioContextClass: undefined })
  await assert.rejects(audio.setCoast(true), /Web Audio is not supported/)
  assert.equal(audio.hasContext(), false)
})
