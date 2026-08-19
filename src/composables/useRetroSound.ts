import { ref } from 'vue'

const STORAGE_KEY = 'portfolio_sfx'
const DEFAULT_SFX_VOLUME = 0.12

/**
 * Module-level state for SFX toggle so all components share the same state.
 */
const isSfxEnabled = ref(true)

function hydrateSfxPreference() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) {
      isSfxEnabled.value = stored === 'true' || stored === '1'
    }
  } catch {
    // Storage unavailable - default to true
  }
}

hydrateSfxPreference()

function persistSfxPreference(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // Ignore storage quota / private browsing errors
  }
}

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

/**
 * Plays a simple tone with an ADSR-like volume envelope.
 */
function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = 'triangle',
  startTimeOffset = 0,
  volume = DEFAULT_SFX_VOLUME,
) {
  if (!isSfxEnabled.value) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime + startTimeOffset
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(freq, now)

  // Smooth attack & decay to prevent audio pops
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.linearRampToValueAtTime(volume, now + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + duration)
}

/**
 * Plays a frequency sweep (pitch bend).
 */
function playSweep(
  startFreq: number,
  endFreq: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = DEFAULT_SFX_VOLUME,
) {
  if (!isSfxEnabled.value) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(startFreq, now)
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration)

  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.linearRampToValueAtTime(volume, now + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + duration)
}

export function useRetroSound() {
  function toggleSfx() {
    isSfxEnabled.value = !isSfxEnabled.value
    persistSfxPreference(isSfxEnabled.value)
    if (isSfxEnabled.value) {
      playBlip()
    }
  }

  function setSfxEnabled(enabled: boolean) {
    isSfxEnabled.value = enabled
    persistSfxPreference(enabled)
  }

  /**
   * Crisp, subtle 8-bit blip for button clicks, card navigation, or small actions.
   */
  function playBlip() {
    playTone(580, 0.035, 'triangle', 0, 0.08)
  }

  /**
   * Cute bubble pop sound for avatar clicks, pill selections, or drawer opening.
   */
  function playPop() {
    playSweep(380, 820, 0.045, 'sine', 0.1)
  }

  /**
   * Soft toggle sound for switching modes or settings.
   */
  function playToggle() {
    playTone(660, 0.03, 'triangle', 0, 0.07)
  }

  /**
   * Happy 8-bit ascending triad arpeggio (C5 -> E5 -> G5) for Day Mode.
   */
  function playThemeDay() {
    if (!isSfxEnabled.value) return
    const notes = [523.25, 659.25, 783.99] // C5, E5, G5
    notes.forEach((freq, idx) => {
      playTone(freq, 0.07, 'triangle', idx * 0.055, 0.09)
    })
  }

  /**
   * Mellow, warm descending notes (G5 -> E5 -> C5) for Night Mode.
   */
  function playThemeNight() {
    if (!isSfxEnabled.value) return
    const notes = [783.99, 659.25, 523.25] // G5, E5, C5
    notes.forEach((freq, idx) => {
      playTone(freq, 0.08, 'sine', idx * 0.065, 0.09)
    })
  }

  /**
   * Classic 8-bit fanfare arpeggio (C5 -> E5 -> G5 -> C6) for guestbook post & chat send.
   */
  function playSuccess() {
    if (!isSfxEnabled.value) return
    const notes = [523.25, 659.25, 783.99, 1046.5] // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      playTone(freq, 0.08, 'triangle', idx * 0.06, 0.1)
    })
  }

  /**
   * Soft low-frequency double buzz for errors or rate limits.
   */
  function playError() {
    if (!isSfxEnabled.value) return
    playTone(200, 0.07, 'sawtooth', 0, 0.07)
    playTone(160, 0.09, 'sawtooth', 0.08, 0.07)
  }

  /**
   * Classic retro coin chime (B5 -> E6).
   */
  function playCoin() {
    if (!isSfxEnabled.value) return
    playTone(987.77, 0.05, 'square', 0, 0.06)
    playTone(1318.51, 0.15, 'square', 0.045, 0.07)
  }

  return {
    isSfxEnabled,
    toggleSfx,
    setSfxEnabled,
    playBlip,
    playPop,
    playToggle,
    playThemeDay,
    playThemeNight,
    playSuccess,
    playError,
    playCoin,
  }
}
