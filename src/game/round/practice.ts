import { directionVector } from '../direction.js'

import { ARENA_WIDTH as WIDTH, ARENA_HEIGHT as HEIGHT, CRYSTAL_COUNT } from '../arena/constants.js'
import type { Point } from '../arena/interfaces/frame.js'
import { ROUND_DURATION_MS } from './constants.js'
import type { MatchFrame, PilotState } from './interfaces/match.js'
import type { StartRound } from './interfaces/session.js'

const COUNTDOWN_MS = 3_000
const PLAYER_SPEED = 240
const BOT_SPEED = 130
function distanceSquared(a: Point, b: Point, scaleX = 1, scaleY = 1): number {
  return ((a.x - b.x) * scaleX) ** 2 + ((a.y - b.y) * scaleY) ** 2
}

type MutablePilot = { -readonly [Key in keyof PilotState]: PilotState[Key] }

export function createLocalMatch(started: number): (now: number, direction: number) => MatchFrame {
  const player: MutablePilot = { x: 224, y: 270, angle: 0, score: 0 }
  const bot: MutablePilot = { x: 736, y: 270, angle: Math.PI, score: 0 }
  const crystals: Point[] = []
  let crystalSnapshot: readonly Point[] | undefined
  const begins = started + COUNTDOWN_MS
  const ends = begins + ROUND_DURATION_MS
  let previous = begins

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
    if (now < begins) return snapshot('countdown', begins - Math.max(now, started))

    const step = Math.min(now, ends)
    const elapsed = Math.min(Math.max(0, step - previous) / 1000, 0.1)
    previous = step
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

    return snapshot(now >= ends ? 'finished' : 'playing', ends - step)
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

export const startLocalRound: StartRound = (name, emit) => {
  const step = createLocalMatch(performance.now())
  let direction = 0
  let request = requestAnimationFrame(tick)

  function tick(now: number): void {
    const frame = step(now, direction)
    if (frame.phase === 'finished') {
      emit({
        kind: 'local-result',
        frame,
        result: {
          id: 'local-' + crypto.randomUUID(),
          name,
          score: frame.player.score,
          botScore: frame.bot.score,
        },
      })
      return
    }
    request = requestAnimationFrame(tick)
    emit({ kind: 'frame', frame })
  }

  return {
    setDirection(value) { direction = value },
    close() { cancelAnimationFrame(request) },
  }
}
