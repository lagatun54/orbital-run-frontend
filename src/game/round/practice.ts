import { animationFrames, defer, map, startWith, takeWhile, withLatestFrom } from 'rxjs'
import { directionVector } from '../direction.js'

import { ARENA_WIDTH as WIDTH, ARENA_HEIGHT as HEIGHT, CRYSTAL_COUNT } from '../arena/constants.js'
import type { Point } from '../arena/interfaces/frame.js'
import { ROUND_DURATION_MS } from './constants.js'
import type { SessionEvent } from './interfaces/events.js'
import type { MatchFrame, PilotState } from './interfaces/match.js'
import type { StartRound } from './interfaces/session.js'

const COUNTDOWN_MS = 3_000
const PLAYER_SPEED = 240
const BOT_SPEED = 130
function distanceSquared(a: Point, b: Point, scaleX = 1, scaleY = 1): number {
  return ((a.x - b.x) * scaleX) ** 2 + ((a.y - b.y) * scaleY) ** 2
}

type MutablePilot = { -readonly [Key in keyof PilotState]: PilotState[Key] }

function readRoundTime(started: number, now: number): Pick<MatchFrame, 'phase' | 'remainingMs'> {
  const elapsed = Math.max(0, now - started)
  if (elapsed < COUNTDOWN_MS) return { phase: 'countdown', remainingMs: COUNTDOWN_MS - elapsed }

  const remainingMs = Math.max(0, ROUND_DURATION_MS - (elapsed - COUNTDOWN_MS))
  return { phase: remainingMs === 0 ? 'finished' : 'playing', remainingMs }
}

export function createLocalMatch(started: number): (now: number, direction: number) => MatchFrame {
  const player: MutablePilot = { x: 224, y: 270, angle: 0, score: 0 }
  const bot: MutablePilot = { x: 736, y: 270, angle: Math.PI, score: 0 }
  const crystals: Point[] = []
  let crystalSnapshot: readonly Point[] | undefined
  let previousRemainingMs = ROUND_DURATION_MS

  function respawn(index: number) {
    let point: Point
    do {
      point = { x: 44 + Math.floor(Math.random() * (WIDTH - 88)), y: 44 + Math.floor(Math.random() * (HEIGHT - 88)) }
    } while (distanceSquared(point, player) < 65 ** 2 || distanceSquared(point, bot) < 65 ** 2 ||
      crystals.some((other, i) => i !== index && distanceSquared(point, other) < 45 ** 2))
    crystals[index] = point
    crystalSnapshot = undefined
  }

  for (let i = 0; i < CRYSTAL_COUNT; i++) respawn(i)

  function snapshot(phase: MatchFrame['phase'], remainingMs: number): MatchFrame {
    return { phase, remainingMs, player: { ...player }, bot: { ...bot }, crystals: crystalSnapshot ??= [...crystals] }
  }

  return (now, direction) => {
    const { phase, remainingMs } = readRoundTime(started, now)
    if (phase === 'countdown') return snapshot(phase, remainingMs)

    const elapsed = Math.min(Math.max(0, previousRemainingMs - remainingMs) / 1000, 0.1)
    previousRemainingMs = remainingMs
    const scaleX = window.innerWidth / WIDTH
    const scaleY = window.innerHeight / HEIGHT
    const screenScale = Math.max(scaleX, scaleY)
    const artworkScale = Math.min(scaleX, scaleY)
    const pickupRadiusSquared = ((Math.max(52 * artworkScale, 42) + Math.max(32 * artworkScale, 26)) * 0.4) ** 2
    const input = directionVector(direction)
    move(player, input.x, input.y, PLAYER_SPEED * elapsed * screenScale, scaleX, scaleY)
    const target = crystals.reduce((nearest, point) => distanceSquared(bot, point) < distanceSquared(bot, nearest) ? point : nearest)
    const dx = (target.x - bot.x) * scaleX
    const dy = (target.y - bot.y) * scaleY
    const length = Math.hypot(dx, dy)
    move(bot, dx, dy, Math.min(BOT_SPEED * elapsed * screenScale, length), scaleX, scaleY)

    for (let i = 0; i < crystals.length; i++) {
      const crystal = crystals[i]!
      const playerDistance = distanceSquared(player, crystal, scaleX, scaleY)
      const botDistance = distanceSquared(bot, crystal, scaleX, scaleY)
      const collector = playerDistance <= pickupRadiusSquared && playerDistance <= botDistance ? player :
        botDistance <= pickupRadiusSquared ? bot : null
      if (collector) {
        collector.score++
        respawn(i)
      }
    }

    return snapshot(phase, remainingMs)
  }
}

function move(ship: MutablePilot, dx: number, dy: number, amount: number, scaleX: number, scaleY: number) {
  const length = Math.hypot(dx, dy)
  if (length === 0) return
  const stepX = dx / length * amount / scaleX
  const stepY = dy / length * amount / scaleY
  ship.angle = Math.atan2(stepY, stepX)
  ship.x = Math.min(WIDTH - 23, Math.max(23, ship.x + stepX))
  ship.y = Math.min(HEIGHT - 23, Math.max(23, ship.y + stepY))
}

export const startLocalRound: StartRound = (name, directions) => defer(() => {
  const step = createLocalMatch(performance.now())
  return animationFrames().pipe(
    withLatestFrom(directions.pipe(startWith(0))),
    map(([{ timestamp }, currentDirection]) => step(timestamp, currentDirection)),
    takeWhile(frame => frame.phase !== 'finished', true),
    map((frame): SessionEvent => {
      if (frame.phase !== 'finished') return { kind: 'frame', frame }
      return {
        kind: 'local-result',
        frame,
        result: {
          id: 'local-' + crypto.randomUUID(),
          name,
          score: frame.player.score,
          botScore: frame.bot.score,
        },
      }
    }),
  )
})
