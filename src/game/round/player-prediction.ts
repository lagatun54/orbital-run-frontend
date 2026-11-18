import { ARENA_HEIGHT, ARENA_WIDTH } from '../arena/constants.js'
import type { ShipPose } from '../arena/interfaces/frame.js'
import { directionVector } from '../direction.js'

// Match the Go arena simulation (internal/arena/arena.go).
const SPEED = 265
const WALL_MARGIN = 23
const MAX_STEP_MS = 100
const PREDICTION_MS = 300
const MAX_LEAD = SPEED * PREDICTION_MS / 1000
const CORRECTION_MS = 90

export function createPlayerPrediction(initial: ShipPose, now: number, direction: number) {
  let pose = initial
  let serverPose = initial
  let receivedAt = now
  let steppedAt = now
  let inputChangedAt = now
  let input = directionVector(direction)

  function step(now: number): ShipPose {
    const elapsed = Math.min(MAX_STEP_MS, Math.min(now, receivedAt + PREDICTION_MS) - steppedAt)
    steppedAt = now
    if (elapsed <= 0) return pose

    const { x: dx, y: dy } = input
    const moving = dx !== 0 || dy !== 0
    const distance = SPEED * elapsed / (1000 * Math.max(1, Math.hypot(dx, dy)))
    let x = Math.min(ARENA_WIDTH - WALL_MARGIN, Math.max(WALL_MARGIN, pose.x + dx * distance))
    let y = Math.min(ARENA_HEIGHT - WALL_MARGIN, Math.max(WALL_MARGIN, pose.y + dy * distance))
    let angle = moving ? Math.atan2(dy, dx) : pose.angle

    const offsetX = x - serverPose.x
    const offsetY = y - serverPose.y
    const offset = Math.hypot(offsetX, offsetY)
    // The protocol has no input acknowledgements. Allow a bounded lead and
    // give the server time to apply a release before reconciling at rest.
    const settling = !moving && now - inputChangedAt >= PREDICTION_MS
    if (settling && offset < 0.1) {
      x = serverPose.x
      y = serverPose.y
      angle = serverPose.angle
    } else if (offset > 0) {
      const excess = settling ? offset : Math.max(0, offset - MAX_LEAD)
      const correction = (excess / offset) * (1 - Math.exp(-elapsed / CORRECTION_MS))
      x -= offsetX * correction
      y -= offsetY * correction
    }
    if (x !== pose.x || y !== pose.y || angle !== pose.angle) pose = { x, y, angle }
    return pose
  }

  return {
    step,
    setDirection(direction: number, now: number) {
      step(now)
      input = directionVector(direction)
      inputChangedAt = now
    },
    receive(next: ShipPose, now: number) {
      // Skip the paused interval when snapshots resume after a stall.
      if (now - receivedAt > PREDICTION_MS) steppedAt = now
      serverPose = next
      receivedAt = now
    },
  }
}
