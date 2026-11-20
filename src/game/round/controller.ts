import { Subject, Subscription } from 'rxjs'
import type { RoundController, RoundDependencies } from './interfaces/controller.js'
import type { RoundCommand, RoundEvent, RoundUpdate } from './interfaces/events.js'
import type { MatchFrame, MatchMode } from './interfaces/match.js'
import type { StartRound } from './interfaces/session.js'

interface MatchConnection {
  directions: Subject<number>
  subscription: Subscription
  sentDirection: number
}

export function createRoundController({
  store, commands, controls, startLocal, startOnline,
}: RoundDependencies): RoundController {
  const frames = new Subject<{ frame: MatchFrame; reset: boolean }>()
  const events = new Subject<RoundEvent>()
  let active: MatchConnection | undefined
  let disposed = false

  function isActive(): boolean {
    const { phase } = store.getState()
    return active !== undefined && (phase === 'countdown' || phase === 'playing')
  }

  function setDirection(direction: number): void {
    const { phase } = store.getState()
    if (!active || (phase !== 'countdown' && phase !== 'playing') ||
        direction === active.sentDirection) return
    active.sentDirection = direction
    active.directions.next(direction)
  }

  function closeSession(): void {
    const match = active
    active = undefined
    match?.subscription.unsubscribe()
    match?.directions.complete()
  }

  function begin(name: string, mode: MatchMode, startRound: StartRound): void {
    const match: MatchConnection = { directions: new Subject(), subscription: new Subscription(), sentDirection: -1 }
    active = match

    const updates = startRound(name, match.directions.asObservable())
    match.subscription.add(updates.subscribe(event => {
      if (active !== match) return
      if (event.kind !== 'disconnected') {
        showUpdate(event, mode)
        return
      }
      closeSession()
      controls.clear()
      if (store.events.connectionFailed()) {
        startMatch(name, 'local', startLocal)
        return
      }
      if (store.events.disconnected()) events.next({ kind: 'interrupted' })
    }))
    if (active === match) setDirection(controls.direction())
  }

  function startMatch(name: string, mode: MatchMode, startRound: StartRound): void {
    events.next({ kind: 'starting', mode })
    if (!disposed) begin(name, mode, startRound)
  }

  function showUpdate(update: RoundUpdate, mode: MatchMode): void {
    const previous = store.getState().phase
    const { frame } = update
    const { phase } = frame
    if (!store.updateRound(update, mode)) return
    frames.next({ frame, reset: previous === 'connecting' || previous === 'starting' })

    if (update.kind === 'frame') {
      if (phase !== previous && phase !== 'finished') {
        events.next({ kind: 'phase-changed', phase, mode })
        setDirection(controls.direction())
      }
      return
    }

    closeSession()
    controls.clear()
    events.next({ kind: 'finished', completion: update })
  }

  function dispatch(command: RoundCommand): void {
    if (command.kind === 'direction') {
      setDirection(command.direction)
      return
    }
    const state = store.getState()
    if (disposed || active || !('mode' in state)) return
    const online = state.mode === 'online' && startOnline
    const started = online ? store.events.startOnline() : store.events.startLocal()
    if (!started) return
    controls.clear()
    startMatch(command.name, online ? 'online' : 'local', online || startLocal)
  }

  const input = commands.subscribe(dispatch)

  return {
    frames: frames.asObservable(),
    events: events.asObservable(),
    dispose() {
      disposed = true
      input.unsubscribe()
      closeSession()
      frames.complete()
      events.complete()
    },
    isActive,
  }
}
