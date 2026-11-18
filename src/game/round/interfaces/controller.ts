import type { RoundCommand, RoundEvent, RoundUpdate } from './events.js'
import type { MatchFrame, MatchMode } from './match.js'
import type { RoundSession, StartRound } from './session.js'
import type { RoundState } from './state.js'

interface RoundStore {
  getState(): RoundState | { readonly phase: 'loading' | 'error' }
  transition(state: RoundState): void
  updateRound(update: RoundUpdate, mode: MatchMode): void
}

interface RoundInput {
  clear(): void
  direction(): number
}

export interface RoundDependencies {
  store: RoundStore
  renderFrame(frame: MatchFrame, reset: boolean): void
  publish(event: RoundEvent): void
  controls: RoundInput
  startLocal: StartRound
  startOnline?: StartRound
}

export interface RoundController {
  dispose(): void
  dispatch(command: RoundCommand): void
  isActive(): boolean
}

export interface MatchConnection {
  session?: RoundSession
  sentDirection: number
}
