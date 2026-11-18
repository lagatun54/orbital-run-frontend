import type { RoundState } from '../../game/round/interfaces/state.js'

export type AppState = RoundState | Readonly<
  | { phase: 'loading' }
  | { phase: 'error'; error: unknown }
>
