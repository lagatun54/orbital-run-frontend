import { subscribeWithSelector } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'
import type { RoundUpdate } from '../game/round/interfaces/events.js'
import type { MatchFrame, MatchMode } from '../game/round/interfaces/match.js'
import type { AppState } from './interfaces/state.js'

export function createAppStore() {
  const store = createStore<AppState>()(subscribeWithSelector<AppState>(() => ({ phase: 'loading' })))
  let latestFrame: MatchFrame | undefined

  return {
    getState: store.getState,
    subscribe: store.subscribe,
    getSnapshot() {
      const state = store.getState()
      return latestFrame ? { ...state, frame: latestFrame } : state
    },
    transition(state: AppState) {
      latestFrame = undefined
      store.setState(state, true)
    },
    updateRound(update: RoundUpdate, mode: MatchMode) {
      latestFrame = update.frame
      const { phase } = update.frame
      if (phase === store.getState().phase) return
      if (phase === 'finished' && update.kind !== 'frame') {
        store.setState({ phase, mode, result: update.result }, true)
      } else {
        store.setState({ phase, mode }, true)
      }
    },
  }
}
