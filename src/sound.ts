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

function roar(intensity = 1, when?: number, out?: AudioNode) {
  const a = ctx()
  if (!a) return
  const t = when ?? a.currentTime
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
  src
    .connect(hp)
    .connect(lp)
    .connect(vowel)
    .connect(vowel2)
    .connect(flutter)
    .connect(g)
    .connect(out ?? a.destination)
  src.start(t, Math.random() * 0.3)
  src.stop(t + dur)
}

function whistle(d = 0.32, when?: number, out?: AudioNode) {
  const a = ctx()
  if (!a) return
  const t = when ?? a.currentTime
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
  g.connect(out ?? a.destination)
}

/** Crowd groan (spec §17): the roar noise through a lowpass 2000 → 380 Hz and a peak 700 → 320 Hz, from +.5 s. */
function groan(when?: number, out?: AudioNode) {
  const a = ctx()
  if (!a) return
  const t = (when ?? a.currentTime) + 0.5
  const dur = 2.4
  noiseBuf ??= noise(a, 3)
  const src = a.createBufferSource()
  src.buffer = noiseBuf
  const lp = a.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(2000, t)
  lp.frequency.exponentialRampToValueAtTime(380, t + dur)
  const pk = a.createBiquadFilter()
  pk.type = 'peaking'
  pk.frequency.setValueAtTime(700, t)
  pk.frequency.exponentialRampToValueAtTime(320, t + dur)
  pk.Q.value = 1.6
  pk.gain.value = 10
  const g = a.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.18)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src
    .connect(lp)
    .connect(pk)
    .connect(g)
    .connect(out ?? a.destination)
  src.start(t, Math.random() * 0.3)
  src.stop(t + dur)
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
  /** Knocked out (§17): long whistle + groan. Replay button only; the overlay's auto-play is silent. */
  knockedOut() {
    if (!on) return
    whistle(0.9)
    groan()
  },
  fullTime() {
    if (!on) return
    whistle(0.22)
    later(320, () => whistle(0.22))
    later(640, () => whistle(0.9))
    later(700, () => roar(0.55))
  },
}

// ---------- Round recap (docs/UI-REDESIGN.md §19, ported from docs/ui-prototype/Recap.dc.html) ----------
// Every recap sound is scheduled on the audio clock and runs through one gain bus, so navigating cuts the old card's
// sounds, and suspending the context freezes them in place (hold to pause).

export type CardSound = 'through' | 'out' | 'exact' | 'points' | 'zero' | 'jinxLanded' | 'jinxMissed' | 'jinxed'

let master: GainNode | null = null
let chain: DynamicsCompressorNode | null = null
const curves = new Map<number, Float32Array<ArrayBuffer>>()

/** Master chain: a fast compressor with make-up gain so the hits land loud and even on a phone speaker. */
function fx(a: AudioContext) {
  if (!chain) {
    chain = a.createDynamicsCompressor()
    chain.threshold.value = -22
    chain.knee.value = 6
    chain.ratio.value = 10
    chain.attack.value = 0.001
    chain.release.value = 0.16
    const mk = a.createGain()
    mk.gain.value = 2.6
    chain.connect(mk).connect(a.destination)
  }
  return chain
}

function bus(a: AudioContext) {
  if (!master) {
    master = a.createGain()
    master.connect(fx(a))
  }
  return master
}

/** Soft clip: adds harmonics so low thuds are still heard on iPhone speakers (they barely play below ~150 Hz). */
function curve(k: number) {
  if (!curves.has(k)) {
    const n = 2048
    const c = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1
      c[i] = ((1 + k) * x) / (1 + k * Math.abs(x))
    }
    curves.set(k, c)
  }
  return curves.get(k)!
}

function env(a: AudioContext, t: number, lvl: number, attack: number, dec: number) {
  const g = a.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(lvl, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dec)
  return g
}

function noiseHit(a: AudioContext, t: number, type: BiquadFilterType, f: number, q: number, lvl: number, dec: number) {
  noiseBuf ??= noise(a, 3)
  const src = a.createBufferSource()
  src.buffer = noiseBuf
  const fl = a.createBiquadFilter()
  fl.type = type
  fl.frequency.value = f
  if (q) fl.Q.value = q
  src
    .connect(fl)
    .connect(env(a, t, lvl, 0.002, dec))
    .connect(bus(a))
  src.start(t, Math.random() * 2)
  src.stop(t + dec + 0.05)
}

/** A driven sine dropping in pitch through a soft clip: the body of every hit. */
function driven(
  a: AudioContext,
  t: number,
  f0: number,
  f1: number,
  glide: number,
  k: number,
  lvl: number,
  dec: number,
) {
  const o = a.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(f1, t + glide)
  const sh = a.createWaveShaper()
  sh.curve = curve(k)
  o.connect(sh)
    .connect(env(a, t, lvl, 0.003, dec))
    .connect(bus(a))
  o.start(t)
  o.stop(t + dec + 0.05)
}

function knock(a: AudioContext, t: number, f0: number, f1: number, glide: number, lvl: number, dec: number) {
  const o = a.createOscillator()
  o.type = 'triangle'
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(f1, t + glide)
  o.connect(env(a, t, lvl, 0.003, dec)).connect(bus(a))
  o.start(t)
  o.stop(t + dec + 0.05)
}

/** Punch: driven sine 230 → 46 Hz (k 10) + 170 → 95 Hz triangle knock + 1 kHz slap (75 ms) + 2.6 kHz snap (22 ms). */
function punch(a: AudioContext, t: number, v = 1) {
  driven(a, t, 230, 46, 0.15, 10, 0.95 * Math.min(v, 1.4), 0.18 + v * 0.08)
  knock(a, t, 170, 95, 0.1, 0.6 * v, 0.14)
  noiseHit(a, t, 'bandpass', 1050, 0.9, v, 0.075)
  noiseHit(a, t, 'highpass', 2600, 0, 0.7 * v, 0.022)
}

/** Ground thud: driven sine 120 → 34 Hz (k 14) + 150 → 70 Hz triangle + noise body (420 Hz) + rumble (180 Hz) + punch. */
function groundThud(a: AudioContext, t: number, v = 1) {
  driven(a, t, 120, 34, 0.5, 14, Math.min(v, 1.4), 0.55 + v * 0.15)
  knock(a, t, 150, 70, 0.25, 0.75 * v, 0.3)
  noiseHit(a, t, 'lowpass', 420, 0, v, 0.35)
  noiseHit(a, t, 'lowpass', 180, 0, 0.6 * v, 0.9)
  punch(a, t, v * 1.1)
}

/** A low driven knock: the weight under a hit, and the ceramic pieces breaking off and landing (no glassy highs). */
function chunk(a: AudioContext, t: number, f: number, lvl: number) {
  driven(a, t, f, f * 0.45, 0.12, 8, lvl, 0.16)
}

/** The plate breaking: noise through a 700 → 220 Hz band-pass and hard drive, a low body, a punch, then the pieces. */
function shatter(a: AudioContext, t: number) {
  noiseBuf ??= noise(a, 3)
  const src = a.createBufferSource()
  src.buffer = noiseBuf
  const bp = a.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.2
  bp.frequency.setValueAtTime(700, t)
  bp.frequency.exponentialRampToValueAtTime(220, t + 0.4)
  const sh = a.createWaveShaper()
  sh.curve = curve(30)
  src
    .connect(bp)
    .connect(sh)
    .connect(env(a, t, 0.9, 0.003, 0.45))
    .connect(bus(a))
  src.start(t, Math.random() * 2)
  src.stop(t + 0.5)
  driven(a, t, 90, 38, 0.4, 12, 0.9, 0.5) // low body
  punch(a, t, 1.2)
  for (let i = 0; i < 9; i++) chunk(a, t + Math.random() * 0.25, 160 + Math.random() * 220, 0.45) // breaking off
  for (let i = 0; i < 10; i++) chunk(a, t + 0.6 + Math.random() * 0.7, 110 + Math.random() * 170, 0.35) // landing
}

function whoosh(a: AudioContext, t: number, dur: number, lvl: number, f0: number, f1: number) {
  noiseBuf ??= noise(a, 3)
  const src = a.createBufferSource()
  src.buffer = noiseBuf
  const bp = a.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.1
  bp.frequency.setValueAtTime(f0, t)
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur)
  const g = a.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(lvl, t + dur * 0.8)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(bp).connect(g).connect(bus(a))
  src.start(t, Math.random())
  src.stop(t + dur + 0.05)
}

function blip(a: AudioContext, t: number, f0: number, f1: number, lvl: number) {
  knock(a, t, f0, f1, 0.12, lvl, 0.18)
}

function womp(a: AudioContext, t: number) {
  const o = a.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(260, t)
  o.frequency.exponentialRampToValueAtTime(110, t + 0.45)
  const lp = a.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 700
  o.connect(lp)
    .connect(env(a, t, 0.12, 0.03, 0.5))
    .connect(bus(a))
  o.start(t)
  o.stop(t + 0.55)
}

function chime(a: AudioContext, t: number) {
  for (const [f, dt] of [
    [784, 0],
    [1047, 0.12],
    [1319, 0.24],
  ]) {
    const o = a.createOscillator()
    o.type = 'triangle'
    o.frequency.value = f
    o.connect(env(a, t + dt, 0.18, 0.02, 0.6)).connect(bus(a))
    o.start(t + dt)
    o.stop(t + dt + 0.65)
  }
}

const thwack = (a: AudioContext, t: number, lvl = 1) => punch(a, t, 0.9 * lvl)

export const recapSfx = {
  /** Cut the previous card's sounds: fade the bus and drop it. */
  cut() {
    if (!master || !ac) return
    const m = master
    m.gain.setTargetAtTime(0, ac.currentTime, 0.03)
    setTimeout(() => m.disconnect(), 400)
    master = null
  },
  pause() {
    if (ac?.state === 'running') void ac.suspend()
  },
  resume() {
    if (ac?.state === 'suspended') void ac.resume()
  },
  /** The clash, beat by beat. Times match the CSS: hits .75 / 1.65, smash 2.8, burst 2.95, slam 3.8. */
  clash(win: 'h' | 'a' | 'draw') {
    const a = on && ctx()
    if (!a) return
    const t = a.currentTime + 0.02
    whoosh(a, t, 0.75, 0.5, 160, 1100) // fly in, spinning
    punch(a, t + 0.75, 1)
    chunk(a, t + 0.75, 240, 0.5) // hit 1
    whoosh(a, t + 0.86, 0.6, 0.3, 900, 260) // drift apart
    whoosh(a, t + 1.3, 0.35, 0.35, 240, 1300) // swing back in
    punch(a, t + 1.65, 1.3)
    chunk(a, t + 1.65, 240, 0.6) // hit 2, harder
    whoosh(a, t + 1.76, 0.6, 0.3, 900, 240)
    whoosh(a, t + 2.2, 0.6, 0.7, 120, 2600) // wind-up and charge, rising
    groundThud(a, t + 2.8, 1) // the smash lands (freeze frame)
    shatter(a, t + 2.95) // the loser bursts
    if (win === 'draw') shatter(a, t + 2.98)
    else whoosh(a, t + 3.2, 0.4, 0.4, 300, 1400) // winner rises
    whoosh(a, t + 3.6, 0.2, 0.55, 1400, 300) // and drops
    groundThud(a, t + 3.8, 1.5) // SLAM
  },
  /** A card's sounds, paired with its entrance (the rc-* classes). offsetMs = when the card mounts. */
  card(s: CardSound, offsetMs = 0) {
    const a = on && ctx()
    if (!a) return
    const t = a.currentTime + 0.02 + offsetMs / 1000
    const b = bus(a)
    if (s === 'through') {
      thwack(a, t + 0.45)
      whistle(0.3, t + 0.45, b)
      roar(1.1, t + 0.6, b)
    }
    if (s === 'out') {
      whistle(0.9, t + 0.1, b)
      thwack(a, t + 0.62, 1.2)
      groan(t + 0.05, b)
    }
    if (s === 'exact') {
      thwack(a, t + 0.45, 0.8)
      groundThud(a, t + 0.6, 0.7)
      chime(a, t + 0.6)
      roar(1.2, t + 0.75, b)
    }
    if (s === 'points') {
      thwack(a, t + 0.45, 0.7)
      chime(a, t + 0.6)
    }
    if (s === 'zero') {
      thwack(a, t + 0.45, 0.5)
      womp(a, t + 0.6)
    }
    if (s === 'jinxLanded') {
      blip(a, t + 0.1, 500, 900, 0.12)
      thwack(a, t + 0.5, 1.1)
      blip(a, t + 0.6, 900, 1500, 0.14)
      roar(0.7, t + 0.6, b)
    }
    if (s === 'jinxMissed') {
      blip(a, t + 0.1, 500, 900, 0.12)
      thwack(a, t + 0.55, 0.5)
      womp(a, t + 0.6)
    }
    if (s === 'jinxed') {
      blip(a, t + 0.1, 500, 900, 0.12)
      blip(a, t + 0.55, 700, 1600, 0.16)
      punch(a, t + 0.6, 0.5) // the shield lands
      roar(0.5, t + 0.6, b)
    }
  },
}
