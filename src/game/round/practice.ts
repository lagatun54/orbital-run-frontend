import {
  ARENA_WIDTH as WIDTH, ARENA_HEIGHT as HEIGHT, CRYSTAL_COUNT, type Point,
} from '../arena/model.js'
import { ROUND_DURATION_MS, type MatchFrame, type PilotState, type StartRound } from './model.js'

const COUNTDOWN_MS = 2_000
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

type MutablePilot = { -readonly [Key in keyof PilotState]: PilotState[Key] }

export function createLocalMatch(started: number): (now: number, direction: number) => MatchFrame {
  const player: MutablePilot = { x: 224, y: 270, angle: 0, score: 0 }
  const bot: MutablePilot = { x: 736, y: 270, angle: Math.PI, score: 0 }
  const crystals: Point[] = []
  const begins = started + COUNTDOWN_MS
  const ends = begins + ROUND_DURATION_MS
  let previous = begins

  function respawn(index: number) {
    let point: Point
    do {
      point = { x: 44 + Math.floor(Math.random() * (WIDTH - 88)), y: 44 + Math.floor(Math.random() * (HEIGHT - 88)) }
    } while (distance(point, player) < 65 || distance(point, bot) < 65 ||
      crystals.some((other, i) => i !== index && distance(point, other) < 45))
    crystals[index] = point
  }

  for (let i = 0; i < CRYSTAL_COUNT; i++) respawn(i)

  function snapshot(phase: MatchFrame['phase'], remainingMs: number): MatchFrame {
    return { phase, remainingMs, player: { ...player }, bot: { ...bot }, crystals: [...crystals] }
  }

  return (now, direction) => {
    if (now < begins) return snapshot('countdown', begins - now)

    const step = Math.min(now, ends)
    const elapsed = Math.min(Math.max(0, step - previous) / 1000, 0.1)
    previous = step
    move(player, Number(Boolean(direction & 8)) - Number(Boolean(direction & 4)),
      Number(Boolean(direction & 2)) - Number(Boolean(direction & 1)), 265 * elapsed)
    const target = crystals.reduce((nearest, point) => distance(bot, point) < distance(bot, nearest) ? point : nearest)
    const dx = target.x - bot.x
    const dy = target.y - bot.y
    const length = Math.hypot(dx, dy)
    if (length > 0) move(bot, dx / length, dy / length, 143 * elapsed)

    for (const [i, crystal] of crystals.entries()) {
      const playerDistance = distance(player, crystal)
      const botDistance = distance(bot, crystal)
      const collector = playerDistance < 24 && playerDistance <= botDistance ? player : botDistance < 24 ? bot : null
      if (collector) {
        collector.score++
        respawn(i)
      }
    }

    return snapshot(now >= ends ? 'finished' : 'playing', ends - step)
  }
}

function move(ship: MutablePilot, dx: number, dy: number, amount: number) {
  const length = Math.hypot(dx, dy)
  if (length === 0) return
  ship.angle = Math.atan2(dy, dx)
  ship.x = Math.min(WIDTH - 23, Math.max(23, ship.x + dx * amount / length))
  ship.y = Math.min(HEIGHT - 23, Math.max(23, ship.y + dy * amount / length))
}

export const startLocalRound: StartRound = (name, events) => {
  const step = createLocalMatch(performance.now())
  let direction = 0
  let request = requestAnimationFrame(tick)

  function tick(now: number): void {
    const frame = step(now, direction)
    if (frame.phase === 'finished') {
      events.update({
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
    events.update({ kind: 'frame', frame })
  }

  return {
    setDirection(value) { direction = value },
    close() { cancelAnimationFrame(request) },
  }
}
