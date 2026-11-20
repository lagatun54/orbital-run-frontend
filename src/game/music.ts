const tempo = 116
const sampleRate = 22_050
const eighthNote = 30 / tempo
const stepsPerBar = 8

// MIDI pitches. A zero in the melody is a rest.
const score = [
  { root: 38, chord: [62, 66, 69], melody: [0, 74, 76, 78, 0, 81, 78, 0] },
  { root: 35, chord: [59, 62, 66], melody: [76, 0, 74, 71, 0, 74, 78, 0] },
  { root: 43, chord: [62, 67, 71], melody: [79, 0, 78, 74, 0, 71, 74, 0] },
  { root: 45, chord: [61, 64, 69], melody: [76, 0, 73, 0, 69, 73, 76, 0] },
  { root: 38, chord: [62, 66, 69], melody: [81, 0, 78, 74, 76, 78, 81, 0] },
  { root: 43, chord: [62, 67, 71], melody: [83, 0, 79, 78, 0, 74, 71, 0] },
  { root: 40, chord: [59, 64, 67], melody: [76, 0, 74, 71, 67, 0, 71, 74] },
  { root: 45, chord: [61, 64, 69], melody: [76, 0, 73, 69, 0, 73, 76, 0] },
]
const arpeggio = [0, 1, 2, 1, 0, 2, 1, 2] as const

interface Tone {
  pitch: number
  step: number
  length: number
  level: number
  harmonic: number
}

function mixTone(samples: Float32Array, { pitch, step, length, level, harmonic }: Tone) {
  const offset = Math.round(step * eighthNote * sampleRate)
  const frames = Math.round(length * eighthNote * sampleRate)
  const phaseStep = 2 * Math.PI * 440 * 2 ** ((pitch - 69) / 12) / sampleRate
  const attack = sampleRate * 0.008
  const release = sampleRate * 0.045

  for (let i = 0; i < frames; i++) {
    const phase = i * phaseStep
    const envelope = Math.min(1, i / attack, (frames - 1 - i) / release) * (1 - 0.4 * i / frames)
    const wave = Math.sin(phase) + harmonic * Math.sin(3 * phase)
    const index = offset + i
    samples[index] = samples[index]! + wave * envelope * level
  }
}

export function renderRoundTheme(context: AudioContext): AudioBuffer {
  const frames = Math.round(score.length * stepsPerBar * eighthNote * sampleRate)
  const buffer = context.createBuffer(1, frames, sampleRate)
  const samples = buffer.getChannelData(0)

  score.forEach(({ root, chord, melody }, bar) => {
    const start = bar * stepsPerBar
    for (const [step, pitch] of [root, root, root + 12, root + 7].entries()) {
      mixTone(samples, { pitch, step: start + step * 2, length: 1.6, level: 0.12, harmonic: 0.28 })
    }
    for (const [step, note] of arpeggio.entries()) {
      mixTone(samples, { pitch: chord[note]!, step: start + step, length: 0.58, level: 0.044, harmonic: 0.12 })
    }
    for (const [step, pitch] of melody.entries()) {
      if (pitch > 0) {
        mixTone(samples, { pitch, step: start + step, length: 0.85, level: 0.095, harmonic: 0.21 })
      }
    }
  })

  return buffer
}
