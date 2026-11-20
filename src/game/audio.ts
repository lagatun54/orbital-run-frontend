import { fromEvent, takeUntil } from 'rxjs'
import { createEngine, type Voice } from '@schmooky/zvuk'
import { renderRoundTheme } from './music.js'
import type { RoundStreams } from './round/interfaces/controller.js'
import type { RoundEvent } from './round/interfaces/events.js'
import type { MatchFrame } from './round/interfaces/match.js'

type Note = readonly [frequency: number, duration: number, endFrequency?: number]

interface Cue {
  notes: readonly Note[]
  level: number
  pulse: number
}

const cues = {
  launch: { notes: [[245, 0.14, 690]], level: 0.32, pulse: 0.55 },
  countdown: { notes: [[523, 0.10]], level: 0.32, pulse: 0.42 },
  go: { notes: [[523, 0.06], [1047, 0.19]], level: 0.38, pulse: 0.50 },
  pickup: { notes: [[880, 0.05], [1320, 0.13, 1490]], level: 0.31, pulse: 0.26 },
  win: { notes: [[523, 0.09], [659, 0.09], [784, 0.09], [1047, 0.27]], level: 0.35, pulse: 0.46 },
  loss: { notes: [[392, 0.11], [330, 0.11], [262, 0.25, 196]], level: 0.35, pulse: 0.42 },
  draw: { notes: [[392, 0.10], [523, 0.20]], level: 0.34, pulse: 0.38 },
} satisfies Record<string, Cue>

type CueName = keyof typeof cues

function synthesize(context: AudioContext, { notes, level, pulse }: Cue) {
  const { sampleRate } = context
  const gap = Math.round(sampleRate * 0.012)
  const length = notes.reduce((total, [, duration]) => total + Math.ceil(duration * sampleRate) + gap, -gap)
  const buffer = context.createBuffer(1, length, sampleRate)
  const samples = buffer.getChannelData(0)
  let offset = 0

  for (const [frequency, duration, endFrequency = frequency] of notes) {
    const count = Math.ceil(duration * sampleRate)
    let phase = 0
    for (let i = 0; i < count; i++) {
      const age = i / sampleRate
      const progress = i / (count - 1)
      const envelope = Math.min(1, age / 0.005) * (1 - progress) ** 1.5
      const sine = Math.sin(phase)
      const wave = sine * (1 - pulse) + Math.tanh(3 * sine) * pulse
      samples[offset + i] = wave * envelope * level
      phase += 2 * Math.PI * (frequency + (endFrequency - frequency) * progress) / sampleRate
    }
    offset += count + gap
  }
  return buffer
}

const muteKey = 'orbital-run:sound-muted'

function soundMuted(): boolean {
  try {
    return localStorage.getItem(muteKey) === '1'
  } catch {
    return false
  }
}

export function createGameAudio(round: RoundStreams, signal: AbortSignal) {
  const engine = createEngine({
    buses: {
      sfx: { level: 0.55, concurrency: { max: 4 } },
      music: { level: 0.45, concurrency: { max: 1 } },
    },
    master: { headroom: -3 },
  })
  let muted = soundMuted()
  let ready = false
  let playingRound = false
  let music: Voice | undefined
  let countdownSeconds = Infinity
  let playerScore = 0

  async function unlock() {
    await engine.unlock()
    if (ready || signal.aborted) return
    for (const [name, cue] of Object.entries(cues)) {
      engine.createSound(name, synthesize(engine.context, cue), { bus: 'sfx' })
    }
    ready = true
  }

  function play(name: CueName) {
    if (muted || !ready || signal.aborted || engine.context.state !== 'running') return
    engine.sound(name).play(name === 'pickup' ? { pitch: { jitter: 0.035 } } : undefined)
  }

  function startMusic() {
    if (!playingRound || music || muted || !ready || signal.aborted) return
    if (!engine.hasSound('round-theme')) {
      engine.createSound('round-theme', renderRoundTheme(engine.context), { bus: 'music' })
    }
    music = engine.sound('round-theme').play({ loop: true, fadeIn: 0.75 })
  }

  function stopMusic() {
    playingRound = false
    if (!music) return
    music.stop({ fade: engine.context.state === 'running' ? 0.35 : 0 })
    music = undefined
  }

  signal.addEventListener('abort', () => { void engine.close().catch(() => {}) }, { once: true })

  function showFrame(frame: MatchFrame, reset: boolean) {
    if (frame.phase === 'countdown') {
      const seconds = Math.max(1, Math.ceil(frame.remainingMs / 1000))
      if (seconds < countdownSeconds) {
        countdownSeconds = seconds
        play('countdown')
      }
    }
    if (frame.phase === 'playing') {
      if (!reset && frame.player.score > playerScore) play('pickup')
      playerScore = frame.player.score
    }
  }
  function handleEvent(event: RoundEvent) {
    if (event.kind === 'starting') {
      countdownSeconds = Infinity
      playerScore = 0
    } else if (event.kind === 'phase-changed' && event.phase === 'playing') {
      play('go')
      playingRound = true
      startMusic()
    } else if (event.kind === 'finished') {
      stopMusic()
      const { score, botScore } = event.completion.result
      play(score > botScore ? 'win' : score < botScore ? 'loss' : 'draw')
    } else if (event.kind === 'interrupted') {
      stopMusic()
    }
  }

  if (!signal.aborted) {
    const disposed = fromEvent(signal, 'abort')
    round.frames.pipe(takeUntil(disposed)).subscribe(({ frame, reset }) => showFrame(frame, reset))
    round.events.pipe(takeUntil(disposed)).subscribe(handleEvent)
  }

  return {
    get muted() { return muted },
    toggleMuted() {
      muted = !muted
      try { localStorage.setItem(muteKey, muted ? '1' : '0') } catch { /* Keep the in-memory setting. */ }
      if (ready) {
        engine.bus('sfx').muted = muted
        engine.bus('music').muted = muted
      }
      if (!muted) void unlock().then(startMusic).catch(() => {})
    },
    launch() {
      if (muted) return
      const pressedAt = performance.now()
      void unlock().then(() => {
        if (performance.now() - pressedAt < 250) play('launch')
        startMusic()
      }).catch(() => {})
    },
  }
}
