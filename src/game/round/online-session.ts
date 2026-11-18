import { CRYSTAL_COUNT } from '../arena/constants.js'
import type { Point, ShipPose } from '../arena/interfaces/frame.js'
import type { RoundUpdate } from './interfaces/events.js'
import type { MatchFrame, MatchResult, PickupAck, PickupClaim, PilotState } from './interfaces/match.js'
import type { StartRound } from './interfaces/session.js'
import { isRecord, isFiniteNumber, isScore } from '../../shared/validation.js'
import { createPlayerPrediction } from './player-prediction.js'
import { createPickupPrediction } from './pickup-prediction.js'

const PICKUP_BATCH_MS = 50
const MAX_SNAPSHOT_AGE_MS = 300

export function createOnlineMatch(origin: string): StartRound {
  return (name, emit) => {
    const endpoint = new URL('/ws', origin)
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(endpoint)
    const timeout = window.setTimeout(() => socket.close(), 6000)
    let direction = 0
    let frame: MatchFrame | undefined
    let prediction: ReturnType<typeof createPlayerPrediction> | undefined
    let shownPose: ShipPose | undefined
    let shownPickups: ReadonlySet<number> | undefined
    let receivedAt = 0
    let request: number | undefined
    let pickupTimer: number | undefined
    const pickupQueue: PickupClaim[] = []
    const predictPickups = createPickupPrediction(claim => {
      pickupQueue.push(claim)
      pickupTimer ??= window.setTimeout(flushPickups, PICKUP_BATCH_MS)
    })

    function flushPickups() {
      pickupTimer = undefined
      if (socket.readyState !== WebSocket.OPEN) return
      while (pickupQueue.length) {
        socket.send(JSON.stringify({ direction, pickups: pickupQueue.splice(0, CRYSTAL_COUNT) }))
      }
    }

    function showPrediction(now: number) {
      if (!frame || !prediction) return
      const pose = prediction.step(now)
      const fresh = now - receivedAt < Math.min(MAX_SNAPSHOT_AGE_MS, frame.remainingMs)
      const pendingPickups = predictPickups(frame, pose, now, fresh)
      if (pose === shownPose && pendingPickups === shownPickups) return
      shownPose = pose
      shownPickups = pendingPickups
      emit({ kind: 'frame', frame: { ...frame, pendingPickups, player: { ...pose, score: frame.player.score } } })
    }

    function tick() {
      request = requestAnimationFrame(tick)
      showPrediction(performance.now())
    }

    function stopPrediction() {
      if (request !== undefined) cancelAnimationFrame(request)
      if (pickupTimer !== undefined) window.clearTimeout(pickupTimer)
      pickupTimer = undefined
      pickupQueue.length = 0
      request = undefined
      prediction = undefined
      frame = undefined
      shownPose = undefined
    }

    socket.addEventListener('open', () => socket.send(JSON.stringify({ name })))
    socket.addEventListener('message', event => {
      const update = decodeRoundUpdate(event.data)
      if (!update) {
        socket.close()
        return
      }
      window.clearTimeout(timeout)
      if (update.kind === 'frame' && update.frame.phase === 'playing') {
        const now = performance.now()
        receivedAt = now
        frame = update.frame
        if (!prediction) {
          prediction = createPlayerPrediction(frame.player, now, direction)
          request = requestAnimationFrame(tick)
        } else {
          prediction.receive(frame.player, now)
        }
        shownPose = undefined
        showPrediction(now)
        return
      }
      if (update.kind === 'online-result') stopPrediction()
      emit(update)
    })
    socket.addEventListener('close', () => {
      window.clearTimeout(timeout)
      stopPrediction()
      emit({ kind: 'disconnected' })
    })

    return {
      setDirection(value) {
        direction = value
        prediction?.setDirection(value, performance.now())
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ direction }))
      },
      close() {
        stopPrediction()
        window.clearTimeout(timeout)
        socket.close()
      },
    }
  }
}

export function decodeRoundUpdate(data: unknown): RoundUpdate | undefined {
  if (typeof data !== 'string') return
  let value: unknown
  try {
    value = JSON.parse(data)
  } catch {
    return
  }
  if (!isRecord(value)) return
  const { phase, remainingMs, player, bot, crystals, crystalVersions, pickupAcks } = value
  if (phase !== 'countdown' && phase !== 'playing' && phase !== 'finished') return
  if (!isScore(remainingMs) || !isPilot(player) || !isPilot(bot) ||
      !Array.isArray(crystals) || crystals.length !== CRYSTAL_COUNT || !crystals.every(isPoint)) return
  if (crystalVersions !== undefined && (!Array.isArray(crystalVersions) ||
      crystalVersions.length !== CRYSTAL_COUNT || !crystalVersions.every(isCrystalVersion))) return
  if (pickupAcks !== undefined && (!Array.isArray(pickupAcks) || !pickupAcks.every(isPickupAck))) return
  const frame: MatchFrame = { phase, remainingMs, player, bot, crystals, crystalVersions, pickupAcks }
  if (phase !== 'finished') return { kind: 'frame', frame }

  const { result, queued } = value
  if (!isMatchResult(result) || (queued !== undefined && typeof queued !== 'boolean')) return
  return { kind: 'online-result', frame, result, queued: queued === true }
}

function isCrystalVersion(value: unknown): value is number {
  return isScore(value) && value > 0 && value <= 0xffffffff
}

function isPickupAck(value: unknown): value is PickupAck {
  return isRecord(value) && isScore(value.index) && value.index < CRYSTAL_COUNT &&
    isCrystalVersion(value.version) && typeof value.accepted === 'boolean'
}

function isPoint(value: unknown): value is Point {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)
}

function isPilot(value: unknown): value is PilotState {
  return isRecord(value) && isFiniteNumber(value.angle) && isScore(value.score) && isPoint(value)
}

function isMatchResult(value: unknown): value is MatchResult {
  return isRecord(value) && typeof value.id === 'string' && isScore(value.score) && isScore(value.botScore)
}
