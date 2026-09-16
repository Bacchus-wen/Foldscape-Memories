import { useCallback, useEffect, useRef, useState } from 'react'
import { createCoastalAudio } from './coastal-audio.js'

export const formatMemoryAudioError = error => error?.message
  ? `Sound could not be started: ${error.message}`
  : 'Sound could not be started. Check your browser audio settings.'

export function createAudioChannelUpdater({ getEngine, onState, onError, onClearError }) {
  const versions = { coast: 0, music: 0 }
  return {
    async update(kind, enabled) {
      const version = ++versions[kind]
      onState(kind, enabled)
      onClearError()
      try {
        await getEngine()[kind === 'coast' ? 'setCoast' : 'setMusic'](enabled)
      } catch (cause) {
        if (version !== versions[kind]) return
        onState(kind, false)
        onError(cause)
      }
    },
  }
}

export function useMemoryAudio({ active, fold, rewinding }) {
  const engineRef = useRef(null)
  const mountedRef = useRef(false)
  const environmentRef = useRef({ active, fold, rewinding, hidden: typeof document !== 'undefined' && document.hidden })
  const [coast, setCoast] = useState(false)
  const [music, setMusic] = useState(false)
  const [volume, setVolume] = useState(.55)
  const [error, setError] = useState('')

  const engine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = createCoastalAudio({ onError: cause => {
        if (mountedRef.current) setError(formatMemoryAudioError(cause))
      } })
      engineRef.current.setEnvironment(environmentRef.current)
      engineRef.current.setVolume(volume)
    }
    return engineRef.current
  }, [volume])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      const current = engineRef.current
      engineRef.current = null
      void current?.dispose()
    }
  }, [])

  useEffect(() => {
    environmentRef.current = { ...environmentRef.current, active, fold, rewinding }
    engineRef.current?.setEnvironment(environmentRef.current)
  }, [active, fold, rewinding])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const onVisibility = () => {
      environmentRef.current = { ...environmentRef.current, hidden: document.hidden }
      engineRef.current?.setEnvironment(environmentRef.current)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const engineGetterRef = useRef(engine)
  engineGetterRef.current = engine
  const updaterRef = useRef(null)
  if (!updaterRef.current) updaterRef.current = createAudioChannelUpdater({
    getEngine: () => engineGetterRef.current(),
    onState: (kind, enabled) => (kind === 'coast' ? setCoast : setMusic)(enabled),
    onClearError: () => setError(''),
    onError: cause => { if (mountedRef.current) setError(formatMemoryAudioError(cause)) },
  })

  const onCoast = useCallback(enabled => { void updaterRef.current.update('coast', enabled) }, [])
  const onMusic = useCallback(enabled => { void updaterRef.current.update('music', enabled) }, [])
  const onVolume = useCallback(value => {
    const next = Math.max(0, Math.min(1, Number(value) || 0))
    setVolume(next)
    engineRef.current?.setVolume(next)
  }, [])

  return { coast, music, volume, error, onCoast, onMusic, onVolume }
}
