import type { MatchFrame, MatchResult } from './model.js'

export type MatchMode = 'online' | 'local'

export type RoundState = Readonly<
  | { phase: 'ready'; mode: MatchMode; reason?: 'disconnected' }
  | { phase: 'connecting'; mode: 'online' }
  | { phase: 'starting'; mode: 'local' }
  | { phase: MatchFrame['phase']; mode: MatchMode; frame: MatchFrame; result?: MatchResult }
>
