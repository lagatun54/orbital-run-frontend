import { subscribeWithSelector } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'
import type { RoundUpdate } from '../game/round/interfaces/events.js'
import type { MatchFrame, MatchMode } from '../game/round/interfaces/match.js'
import type { AppState } from './interfaces/state.js'

export function createAppStore() {
  const store = createStore<AppState>()(subscribeWithSelector<AppState>(() => ({ phase: 'loading' })))
  let latestFrame: MatchFrame | undefined

  function when<Args extends unknown[]>(from: readonly AppState['phase'][], apply: (...args: Args) => void) {
    return (...args: Args): boolean => {
      if (!from.includes(store.getState().phase)) return false
      apply(...args)
      return true
    }
  }

  function enter(state: AppState) {
    latestFrame = undefined
    store.setState(state, true)
  }

  function recordFrame(update: RoundUpdate, mode: MatchMode) {
    latestFrame = update.frame
    const { phase } = update.frame
    if (phase === store.getState().phase) return
    if (phase === 'finished' && update.kind !== 'frame') {
      store.setState({ phase, mode, result: update.result }, true)
    } else {
      store.setState({ phase, mode }, true)
    }
  }

  const events = {
    initialized: when(['loading'], (mode: MatchMode) => enter({ phase: 'ready', mode })),
    initializationFailed: when(['loading', 'ready'], (error: unknown) => enter({ phase: 'error', error })),
    startOnline: when(['ready', 'finished'], () => enter({ phase: 'connecting', mode: 'online' })),
    startLocal: when(['ready', 'finished'], () => enter({ phase: 'starting', mode: 'local' })),
    connectionFailed: when(['connecting'], () => enter({ phase: 'starting', mode: 'local' })),
    disconnected: when(['countdown', 'playing'], () => enter({ phase: 'ready', mode: 'local', reason: 'disconnected' })),
  }

  const frameTransitions = {
    countdown: when(['connecting', 'starting', 'countdown'], recordFrame),
    playing: when(['connecting', 'starting', 'countdown', 'playing'], recordFrame),
    finished: when(['connecting', 'starting', 'countdown', 'playing'], recordFrame),
  }

  return {
    getState: store.getState,
    subscribe: store.subscribe,
    events,
    getSnapshot() {
      const state = store.getState()
      return latestFrame ? { ...state, frame: latestFrame } : state
    },
    updateRound(update: RoundUpdate, mode: MatchMode) {
      return frameTransitions[update.frame.phase](update, mode)
    },
  }
}
