import type { MatchFrame, MatchResult } from '../game/round/model.js'

export type MatchMode = 'online' | 'local'

export type AppState = Readonly<
  | { phase: 'loading' }
  | { phase: 'error'; error: unknown }
  | { phase: 'ready'; mode: MatchMode; reason?: 'disconnected' }
  | { phase: 'connecting'; mode: 'online' }
  | { phase: 'starting'; mode: 'local' }
  | { phase: MatchFrame['phase']; mode: MatchMode; frame: MatchFrame; result?: MatchResult }
>

export interface AppStateStore {
  get(): AppState
  set(state: AppState): void
}

let current: AppState = { phase: 'loading' }

export const appState: AppStateStore = {
  get: () => current,
  set(state) { current = state },
}
