import { CRYSTAL_COUNT } from '../arena/constants.js'
import type { Point } from '../arena/interfaces/frame.js'
import type { RoundUpdate } from './interfaces/events.js'
import type { MatchFrame, MatchResult, PilotState } from './interfaces/match.js'
import type { StartRound } from './interfaces/session.js'
import { isRecord, isFiniteNumber, isScore } from '../../shared/validation.js'

export function createOnlineMatch(origin: string): StartRound {
  return (name, emit) => {
    const endpoint = new URL('/ws', origin)
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(endpoint)
    const timeout = window.setTimeout(() => socket.close(), 6000)

    socket.addEventListener('open', () => socket.send(JSON.stringify({ name })))
    socket.addEventListener('message', event => {
      const update = decodeRoundUpdate(event.data)
      if (!update) {
        socket.close()
        return
      }
      window.clearTimeout(timeout)
      emit(update)
    })
    socket.addEventListener('close', () => {
      window.clearTimeout(timeout)
      emit({ kind: 'disconnected' })
    })

    return {
      setDirection(direction) {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ direction }))
      },
      close() { socket.close() },
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
  const { phase, remainingMs, player, bot, crystals } = value
  if (phase !== 'countdown' && phase !== 'playing' && phase !== 'finished') return
  if (!isScore(remainingMs) || !isPilot(player) || !isPilot(bot) ||
      !Array.isArray(crystals) || crystals.length !== CRYSTAL_COUNT || !crystals.every(isPoint)) return
  const frame: MatchFrame = { phase, remainingMs, player, bot, crystals }
  if (phase !== 'finished') return { kind: 'frame', frame }

  const { result, queued } = value
  if (!isMatchResult(result) || (queued !== undefined && typeof queued !== 'boolean')) return
  return { kind: 'online-result', frame, result, queued: queued === true }
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
