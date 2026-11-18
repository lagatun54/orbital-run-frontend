import type { Point } from '../arena/interfaces/frame.js'
import type { MatchFrame, PickupClaim } from './interfaces/match.js'

// Match the online arena's collision radius.
const PICKUP_RADIUS = 24
const CONFIRMATION_MS = 750

interface Attempt {
  point: Point
  version: number | undefined
  expiresAt: number
}

export function createPickupPrediction(queue: (claim: PickupClaim) => void) {
  const attempts = new Map<number, Attempt>()
  let hidden: ReadonlySet<number> = new Set()

  return (frame: MatchFrame, player: Point, now: number, fresh: boolean) => {
    const next = new Set<number>()
    frame.crystals.forEach((point, index) => {
      const version = frame.crystalVersions?.[index]
      let attempt = attempts.get(index)
      if (attempt && (attempt.version !== version || attempt.point.x !== point.x || attempt.point.y !== point.y)) {
        attempts.delete(index)
        attempt = undefined
      }

      if (!attempt && fresh) {
        const distance = Math.hypot(player.x - point.x, player.y - point.y)
        const botDistance = Math.hypot(frame.bot.x - point.x, frame.bot.y - point.y)
        if (distance < PICKUP_RADIUS && distance <= botDistance) {
          attempt = { point, version, expiresAt: now + CONFIRMATION_MS }
          attempts.set(index, attempt)
          if (version !== undefined) queue({ index, version })
        }
      }

      if (!attempt) return
      if (frame.pickupAcks?.some(ack => ack.index === index && ack.version === version && !ack.accepted)) {
        attempt.expiresAt = now
      }
      if (now < attempt.expiresAt) next.add(index)
    })

    if (next.size !== hidden.size || [...next].some(index => !hidden.has(index))) hidden = next
    return hidden
  }
}
