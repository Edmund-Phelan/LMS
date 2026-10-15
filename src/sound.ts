import { useSyncExternalStore } from 'react'

// Crowd roar + referee whistle, synthesised with Web Audio (docs/UI-REDESIGN.md §5), ported from
// docs/ui-prototype/Main.dc.html. No audio files. Only call these from a user tap: iOS needs a gesture to
// start the AudioContext. The iPhone silent switch is respected (we don't touch navigator.audioSession).
// No UI blips: tabs, pills, steppers and other navigation stay silent.

const KEY = 'lms.sound'
const listeners = new Set<() => void>()
let on = (() => {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
})()

export function setSound(v: boolean) {
  on = v
  try {
    localStorage.setItem(KEY, v ? 'on' : 'off')
  } catch {
    /* private mode: just this session */
  }
  listeners.forEach((l) => l())
  if (v) whistle(0.18)
}

export const useSound = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => on,
  )

let ac: AudioContext | null = null
let noiseBuf: AudioBuffer | null = null

function ctx() {
  if (!ac) {
    const AC =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ac = new AC()
  }
  if (ac.state === 'suspended') void ac.resume()
  return ac
}

/** Stereo pink noise (Paul Kellet filter). */
function noise(ac: AudioContext, secs: number) {
  const len = Math.floor(ac.sampleRate * secs)
  const buf = ac.createBuffer(2, len, ac.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + w * 0.0555179
      b1 = 0.99332 * b1 + w * 0.0750759
      b2 = 0.969 * b2 + w * 0.153852
      b3 = 0.8665 * b3 + w * 0.3104856
      b4 = 0.55 * b4 + w * 0.5329522
      b5 = -0.7616 * b5 - w * 0.016898
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
      b6 = w * 0.115926
    }
  }
  return buf
}

function roar(intensity = 1) {
  const a = ctx()
  if (!a) return
  const t = a.currentTime
  const dur = 2.6
  noiseBuf ??= noise(a, 3)
  const src = a.createBufferSource()
  src.buffer = noiseBuf
  const hp = a.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 220
  const lp = a.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(1400, t)
  lp.frequency.linearRampToValueAtTime(3200, t + 0.35)
  lp.frequency.exponentialRampToValueAtTime(1600, t + dur)
  const vowel = a.createBiquadFilter()
  vowel.type = 'peaking'
  vowel.frequency.value = 850
  vowel.Q.value = 1.4
  vowel.gain.value = 9
  const vowel2 = a.createBiquadFilter()
  vowel2.type = 'peaking'
  vowel2.frequency.value = 1350
  vowel2.Q.value = 2
  vowel2.gain.value = 5
  const flutter = a.createGain()
  for (let k = 0; k < dur * 22; k++) flutter.gain.setValueAtTime(0.72 + Math.random() * 0.28, t + k / 22)
  const g = a.createGain()
  const peak = 0.55 * intensity
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + 0.28)
  g.gain.setValueAtTime(peak, t + 0.7)
  g.gain.exponentialRampToValueAtTime(peak * 0.45, t + 1.4)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(hp).connect(lp).connect(vowel).connect(vowel2).connect(flutter).connect(g).connect(a.destination)
  src.start(t, Math.random() * 0.3)
  src.stop(t + dur)
}

function whistle(d = 0.32) {
  const a = ctx()
  if (!a) return
  const t = a.currentTime
  const g = a.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.02)
  g.gain.setValueAtTime(0.16, t + d - 0.05)
  g.gain.exponentialRampToValueAtTime(0.0001, t + d)
  const lfo = a.createOscillator()
  lfo.frequency.value = 38
  const lfoG = a.createGain()
  lfoG.gain.value = 90
  lfo.connect(lfoG)
  for (const f of [2850, 3020]) {
    const o = a.createOscillator()
    o.type = 'sine'
    o.frequency.value = f
    lfoG.connect(o.frequency)
    o.connect(g)
    o.start(t)
    o.stop(t + d)
  }
  lfo.start(t)
  lfo.stop(t + d)
  g.connect(a.destination)
}

const later = (ms: number, f: () => void) => setTimeout(f, ms)

/** The events in §5's table. Each is a no-op with sound off. */
export const sfx = {
  /** Create/resume the AudioContext inside the tap, for a sound that plays after an await. */
  unlock() {
    if (on) ctx()
  },
  pick() {
    if (!on) return
    whistle(0.22)
    later(140, () => roar(1))
  },
  savePrediction() {
    if (!on) return
    whistle(0.15)
    roar(0.45)
  },
  confirmPayment() {
    if (on) whistle(0.18)
  },
  fullTime() {
    if (!on) return
    whistle(0.22)
    later(320, () => whistle(0.22))
    later(640, () => whistle(0.9))
    later(700, () => roar(0.55))
  },
}
