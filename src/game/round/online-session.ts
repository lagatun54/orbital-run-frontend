import { animationFrames, buffer, exhaustMap, fromEvent, map, Observable, share, Subject, Subscription, take, takeUntil, timer } from 'rxjs'
import { CRYSTAL_COUNT } from '../arena/constants.js'
import type { Point, ShipPose } from '../arena/interfaces/frame.js'
import type { RoundUpdate, SessionEvent } from './interfaces/events.js'
import type { MatchFrame, MatchResult, PickupAck, PickupClaim, PilotState } from './interfaces/match.js'
import type { StartRound } from './interfaces/session.js'
import { isRecord, isFiniteNumber, isScore } from '../../shared/validation.js'
import { createPlayerPrediction } from './player-prediction.js'
import { createPickupPrediction } from './pickup-prediction.js'

const PICKUP_BATCH_MS = 50
const MAX_SNAPSHOT_AGE_MS = 300
const FIRST_UPDATE_TIMEOUT_MS = 6000

export function createOnlineMatch(origin: string): StartRound {
  return (name, directions) => new Observable<SessionEvent>(subscriber => {
    const endpoint = new URL('/ws', origin)
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(endpoint)
    const messages = fromEvent<MessageEvent>(socket, 'message').pipe(
      map(event => decodeRoundUpdate(event.data)),
      share(),
    )
    let direction = 0
    let frame: MatchFrame | undefined
    let prediction: ReturnType<typeof createPlayerPrediction> | undefined
    let shownPose: ShipPose | undefined
    let shownPickups: ReadonlySet<number> | undefined
    let receivedAt = 0
    let predictionFrames: Subscription | undefined
    const pickupClaims = new Subject<PickupClaim>()
    const predictPickups = createPickupPrediction(claim => pickupClaims.next(claim))
    const pickupBatches = pickupClaims.pipe(
      buffer(pickupClaims.pipe(exhaustMap(() => timer(PICKUP_BATCH_MS)))),
    ).subscribe(batch => {
      if (socket.readyState !== WebSocket.OPEN) return
      for (let index = 0; index < batch.length; index += CRYSTAL_COUNT) {
        socket.send(JSON.stringify({ direction, pickups: batch.slice(index, index + CRYSTAL_COUNT) }))
      }
    })

    function predictFrame(now: number) {
      if (!frame || !prediction) return
      const pose = prediction.step(now)
      const fresh = now - receivedAt < Math.min(MAX_SNAPSHOT_AGE_MS, frame.remainingMs)
      const pendingPickups = predictPickups(frame, pose, now, fresh)
      if (pose === shownPose && pendingPickups === shownPickups) return
      shownPose = pose
      shownPickups = pendingPickups
      return { ...frame, pendingPickups, player: { ...pose, score: frame.player.score } }
    }

    function stopPrediction() {
      predictionFrames?.unsubscribe()
      predictionFrames = undefined
      pickupBatches.unsubscribe()
      prediction = undefined
      frame = undefined
      shownPose = undefined
    }

    const subscriptions = new Subscription()

    function emitPrediction(now: number) {
      const frame = predictFrame(now)
      if (frame) subscriber.next({ kind: 'frame', frame })
    }

    subscriptions.add(directions.subscribe(value => {
      direction = value
      prediction?.setDirection(value, performance.now())
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ direction }))
    }))
    subscriptions.add(fromEvent(socket, 'open').pipe(take(1)).subscribe(() => {
      socket.send(JSON.stringify({ name }))
    }))
    subscriptions.add(timer(FIRST_UPDATE_TIMEOUT_MS).pipe(takeUntil(messages)).subscribe(() => {
      socket.close()
    }))
    subscriptions.add(messages.subscribe(update => {
      if (!update) {
        socket.close()
        return
      }
      if (update.kind === 'frame' && update.frame.phase === 'playing') {
        const now = performance.now()
        receivedAt = now
        frame = update.frame
        if (!prediction) {
          prediction = createPlayerPrediction(frame.player, now, direction)
          predictionFrames = animationFrames(performance).subscribe(({ timestamp }) => emitPrediction(timestamp))
        } else {
          prediction.receive(frame.player, now)
        }
        shownPose = undefined
        emitPrediction(now)
        return
      }
      if (update.kind === 'online-result') stopPrediction()
      subscriber.next(update)
    }))
    subscriptions.add(fromEvent(socket, 'close').subscribe(() => {
      subscriber.next({ kind: 'disconnected' })
      subscriber.complete()
    }))

    return () => {
      subscriptions.unsubscribe()
      stopPrediction()
      if (socket.readyState < WebSocket.CLOSING) socket.close()
    }
  })
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
