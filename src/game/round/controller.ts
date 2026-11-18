import type { MatchConnection, RoundController, RoundDependencies } from './interfaces/controller.js'
import type { RoundUpdate } from './interfaces/events.js'
import type { MatchMode } from './interfaces/match.js'
import type { StartRound } from './interfaces/session.js'

export function createRoundController({
  store, renderFrame, publish, controls, startLocal, startOnline,
}: RoundDependencies): RoundController {
  let active: MatchConnection | undefined
  let disposed = false

  function isActive(): boolean {
    const { phase } = store.getState()
    return active?.session !== undefined && (phase === 'countdown' || phase === 'playing')
  }

  function setDirection(direction: number): void {
    const { phase } = store.getState()
    if (!active?.session || (phase !== 'countdown' && phase !== 'playing') ||
        direction === active.sentDirection) return
    active.session.setDirection(direction)
    active.sentDirection = direction
  }

  function closeSession(): void {
    const session = active?.session
    active = undefined
    session?.close()
  }

  function begin(name: string, mode: MatchMode, startRound: StartRound): void {
    const match: MatchConnection = { sentDirection: -1 }
    active = match

    const session = startRound(name, event => {
      if (active !== match) return
      if (event.kind !== 'disconnected') {
        showUpdate(event, mode)
        return
      }
      active = undefined
      controls.clear()
      if (store.getState().phase === 'connecting') {
        startMatch(name, 'local', startLocal)
        return
      }
      store.transition({ phase: 'ready', mode: 'local', reason: 'disconnected' })
      publish({ kind: 'interrupted' })
    })
    if (active === match) {
      match.session = session
      setDirection(controls.direction())
    } else {
      session.close()
    }
  }

  function startMatch(name: string, mode: MatchMode, startRound: StartRound): void {
    store.transition(mode === 'online' ? { phase: 'connecting', mode } : { phase: 'starting', mode })
    publish({ kind: 'starting', mode })
    if (!disposed) begin(name, mode, startRound)
  }

  function showUpdate(update: RoundUpdate, mode: MatchMode): void {
    const previous = store.getState().phase
    const { frame } = update
    const { phase } = frame
    if (previous === 'finished' || (previous === 'playing' && phase === 'countdown')) return
    store.updateRound(update, mode)
    renderFrame(frame, previous === 'connecting' || previous === 'starting')

    if (update.kind === 'frame') {
      if (phase !== previous && phase !== 'finished') {
        publish({ kind: 'phase-changed', phase, mode })
        setDirection(controls.direction())
      }
      return
    }

    closeSession()
    controls.clear()
    publish({ kind: 'finished', completion: update })
  }

  return {
    dispose() {
      disposed = true
      closeSession()
    },
    dispatch(command) {
      if (command.kind === 'direction') {
        setDirection(command.direction)
        return
      }
      const state = store.getState()
      if (disposed || active || (state.phase !== 'ready' && state.phase !== 'finished')) return
      controls.clear()
      if (state.mode === 'online' && startOnline) {
        startMatch(command.name, 'online', startOnline)
      } else {
        startMatch(command.name, 'local', startLocal)
      }
    },
    isActive,
  }
}
