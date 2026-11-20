import type { Observable } from 'rxjs'
import type { RoundCommand, RoundEvent, RoundUpdate } from './events.js'
import type { MatchFrame, MatchMode } from './match.js'
import type { StartRound } from './session.js'
import type { RoundState } from './state.js'

interface RoundStore {
  getState(): RoundState | { readonly phase: 'loading' | 'error' }
  events: {
    startOnline(): boolean
    startLocal(): boolean
    connectionFailed(): boolean
    disconnected(): boolean
  }
  updateRound(update: RoundUpdate, mode: MatchMode): boolean
}

interface RoundInput {
  clear(): void
  direction(): number
}

export interface RoundDependencies {
  store: RoundStore
  commands: Observable<RoundCommand>
  controls: RoundInput
  startLocal: StartRound
  startOnline?: StartRound
}

export interface RoundStreams {
  readonly frames: Observable<{ frame: MatchFrame; reset: boolean }>
  readonly events: Observable<RoundEvent>
}

export interface RoundController extends RoundStreams {
  dispose(): void
  isActive(): boolean
}
