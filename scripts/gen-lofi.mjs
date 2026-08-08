/**
 * Generates the three placeholder lofi loops in `public/music/`.
 *
 * Why generated rather than downloaded: a placeholder that ships in a public repo
 * still has to be license-clean, and synthesising it sidesteps the question. These
 * are scaffolding — delete them, and this script, once real audio lands.
 *
 * Usage, from the repo root:
 *
 *   node scripts/gen-lofi.mjs            # writes into ./public/music
 *   node scripts/gen-lofi.mjs some/dir   # or an explicit output directory
 *
 * No dependencies, and no TypeScript involvement: both tsconfigs use explicit
 * `include` allowlists that cover only config globs and `src/**`, so nothing here
 * reaches `vue-tsc --build`.
 *
 * Output is 16 kHz mono 16-bit WAV, ~417 KB per track. The low rate is deliberate
 * rather than a shortcut: it caps the spectrum at 8 kHz, which is the dulled-highs
 * character lofi is named for, and keeps the files small enough that committing
 * them is not a decision worth deliberating over.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SAMPLE_RATE = 16000
const BPM = 72
const BEAT = 60 / BPM // 0.8333 s
const BAR = BEAT * 4 // 3.3333 s
const BARS = 4 // ~13.3 s per track — short on purpose, so auto-advance is quick to watch

/** Equal temperament, A4 = MIDI 69 = 440 Hz. */
const freq = (midi) => 440 * 2 ** ((midi - 69) / 12)

/**
 * Folds a chord root into MIDI 33-45, i.e. 55-98 Hz.
 *
 * A fixed `root - 12` would be simpler and wrong: the lowest progression here
 * bottoms out at 36 Hz, which laptop speakers cannot reproduce but which still
 * counts toward the peak that normalisation divides by. The result is an
 * inaudible tone making every audible one quieter.
 */
function bassNote(root) {
  let n = root - 12
  while (n < 33) n += 12
  while (n > 45) n -= 12
  return n
}

/**
 * Deterministic PRNG (mulberry32), so re-running produces byte-identical files
 * rather than a fresh diff every time.
 */
function mulberry32(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Trapezoidal envelope. Attack and release are in seconds, clamped to the note. */
function env(t, dur, attack, release) {
  if (t < 0 || t > dur) return 0
  const a = attack > 0 ? Math.min(1, t / attack) : 1
  const r = release > 0 ? Math.min(1, (dur - t) / release) : 1
  return Math.max(0, Math.min(a, r))
}

/** Soft pad: two slightly detuned sines beating against each other, plus a quiet octave. */
function pad(f, t, dur) {
  const e = env(t, dur, 0.4, 0.7)
  if (e <= 0) return 0
  const w = 2 * Math.PI * t
  return e * (0.5 * Math.sin(w * f) + 0.34 * Math.sin(w * f * 1.004) + 0.16 * Math.sin(w * f * 2))
}

/** Bass: sine with a touch of second harmonic so it survives small speakers. */
function bass(f, t, dur) {
  const e = env(t, dur, 0.012, 0.22)
  if (e <= 0) return 0
  const w = 2 * Math.PI * t
  return e * (Math.sin(w * f) + 0.22 * Math.sin(w * f * 2))
}

/** Electric-piano-ish plink for the off-beat chord tones. */
function keys(f, t, dur) {
  const e = env(t, dur, 0.006, dur * 0.85) * Math.exp(-t * 2.6)
  if (e <= 0) return 0
  const w = 2 * Math.PI * t
  return e * (0.7 * Math.sin(w * f) + 0.2 * Math.sin(w * f * 3))
}

/** Kick: fast downward pitch sweep. Phase is approximated; over ~200 ms it reads fine. */
function kick(t, dur) {
  const e = env(t, dur, 0.003, dur * 0.9)
  if (e <= 0) return 0
  const f = 42 + 96 * Math.exp(-t * 20)
  return e * Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 7)
}

/** Hat: a short noise burst. */
function hat(t, dur, noise) {
  const e = env(t, dur, 0.001, dur * 0.8)
  if (e <= 0) return 0
  return e * (noise * 2 - 1) * Math.exp(-t * 55)
}

/**
 * Tracks share one voice set and differ only in progression and register, which is
 * enough to tell them apart in the drawer without any of them standing out.
 */
const TRACKS = [
  {
    file: 'dust-motes.wav',
    seed: 1337,
    // Dm7 - G7 - Cmaj7 - Am7
    prog: [
      [50, 53, 57, 60],
      [55, 59, 62, 65],
      [48, 52, 55, 59],
      [45, 48, 52, 55],
    ],
  },
  {
    file: 'late-bus.wav',
    seed: 20260808,
    // Am7 - Fmaj7 - Cmaj7 - G
    prog: [
      [45, 48, 52, 55],
      [41, 45, 48, 52],
      [48, 52, 55, 59],
      [43, 47, 50, 55],
    ],
  },
  {
    file: 'window-seat.wav',
    seed: 90210,
    // Em7 - Am7 - Dm7 - G7
    prog: [
      [40, 43, 47, 50],
      [45, 48, 52, 55],
      [38, 41, 45, 48],
      [43, 47, 50, 53],
    ],
  },
]

function render({ seed, prog }) {
  const total = Math.round(BARS * BAR * SAMPLE_RATE)
  const buf = new Float64Array(total)
  const rnd = mulberry32(seed)

  // Schedule every note first, then sum per sample. Slower than streaming, but it
  // keeps each voice a pure function of time and the scheduling readable.
  const events = []
  for (let b = 0; b < BARS; b++) {
    const chord = prog[b % prog.length]
    const barStart = b * BAR
    const bassFreq = freq(bassNote(chord[0]))

    for (const n of chord) {
      events.push({ v: pad, f: freq(n), at: barStart, dur: BAR * 0.94, gain: 0.2 })
    }

    events.push({ v: bass, f: bassFreq, at: barStart, dur: BEAT * 1.4, gain: 0.5 })
    events.push({ v: bass, f: bassFreq, at: barStart + BEAT * 2.5, dur: BEAT * 0.9, gain: 0.38 })

    // Upper chord tones landing off the beat — the loose, behind-the-beat feel.
    events.push({ v: keys, f: freq(chord[2] + 12), at: barStart + BEAT * 1.5, dur: BEAT * 1.1, gain: 0.16 })
    events.push({ v: keys, f: freq(chord[3] + 12), at: barStart + BEAT * 3.25, dur: BEAT * 0.9, gain: 0.13 })

    events.push({ v: kick, f: 0, at: barStart, dur: 0.22, gain: 0.62 })
    events.push({ v: kick, f: 0, at: barStart + BEAT * 2, dur: 0.22, gain: 0.52 })

    for (const eighth of [0.5, 1.5, 2.5, 3.5]) {
      events.push({ v: hat, f: 0, at: barStart + BEAT * eighth, dur: 0.06, gain: 0.09, noisy: true })
    }
  }

  for (let i = 0; i < total; i++) {
    const t = i / SAMPLE_RATE
    let s = 0
    for (const e of events) {
      const local = t - e.at
      if (local < 0 || local > e.dur) continue
      s += e.gain * (e.noisy ? e.v(local, e.dur, rnd()) : e.v(e.f, local, e.dur))
    }
    // Vinyl bed: steady hiss plus sparse crackle. Carries more of the lofi
    // signature than any of the notes above.
    s += (rnd() * 2 - 1) * 0.006
    if (rnd() < 0.0012) s += (rnd() * 2 - 1) * 0.16
    buf[i] = s
  }

  // One-pole lowpass at ~3.2 kHz, to take the edge off the noise and the plinks.
  const dt = 1 / SAMPLE_RATE
  const rc = 1 / (2 * Math.PI * 3200)
  const a = dt / (rc + dt)
  let prev = 0
  for (let i = 0; i < total; i++) {
    prev += a * (buf[i] - prev)
    buf[i] = prev
  }

  // Normalise for headroom, then saturate gently for warmth.
  let peak = 0
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(buf[i]))
  const norm = peak > 0 ? 0.82 / peak : 1
  const drive = 1.25
  const shape = Math.tanh(drive)
  for (let i = 0; i < total; i++) buf[i] = Math.tanh(buf[i] * norm * drive) / shape

  // 25 ms edge fades. The player advances on `ended` rather than looping a single
  // file, so these only need to stop a click at the very start and end.
  const fade = Math.round(0.025 * SAMPLE_RATE)
  for (let i = 0; i < fade; i++) {
    const g = i / fade
    buf[i] *= g
    buf[total - 1 - i] *= g
  }

  return buf
}

/** Minimal 16-bit PCM mono WAV container. */
function toWav(samples) {
  const dataSize = samples.length * 2
  const out = Buffer.alloc(44 + dataSize)

  out.write('RIFF', 0, 'ascii')
  out.writeUInt32LE(36 + dataSize, 4)
  out.write('WAVE', 8, 'ascii')
  out.write('fmt ', 12, 'ascii')
  out.writeUInt32LE(16, 16) // fmt chunk size
  out.writeUInt16LE(1, 20) // PCM
  out.writeUInt16LE(1, 22) // mono
  out.writeUInt32LE(SAMPLE_RATE, 24)
  out.writeUInt32LE(SAMPLE_RATE * 2, 28) // byte rate
  out.writeUInt16LE(2, 32) // block align
  out.writeUInt16LE(16, 34) // bits per sample
  out.write('data', 36, 'ascii')
  out.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    out.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2)
  }
  return out
}

const outDir = resolve(process.argv[2] ?? join(process.cwd(), 'public', 'music'))
mkdirSync(outDir, { recursive: true })

for (const track of TRACKS) {
  const wav = toWav(render(track))
  writeFileSync(join(outDir, track.file), wav)
  console.log(`${track.file}  ${(wav.length / 1024).toFixed(0)} KB`)
}

console.log(`\nWrote ${TRACKS.length} files to ${outDir}`)
