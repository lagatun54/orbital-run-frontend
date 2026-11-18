import type { MatchMode, MatchResult } from './match.js'

export type RoundState = Readonly<
  | { phase: 'ready'; mode: MatchMode; reason?: 'disconnected' }
  | { phase: 'connecting'; mode: 'online' }
  | { phase: 'starting'; mode: 'local' }
  | { phase: 'countdown' | 'playing'; mode: MatchMode }
  | { phase: 'finished'; mode: MatchMode; result?: MatchResult }
>
