import type { LocalResult, MatchFrame, MatchMode, MatchResult } from './match.js'

export type RoundCompletion =
  | { kind: 'online-result'; frame: MatchFrame; result: MatchResult; queued: boolean }
  | { kind: 'local-result'; frame: MatchFrame; result: LocalResult }

export type RoundUpdate = { kind: 'frame'; frame: MatchFrame } | RoundCompletion
export type SessionEvent = RoundUpdate | { kind: 'disconnected' }

export type RoundCommand =
  | { kind: 'start'; name: string }
  | { kind: 'direction'; direction: number }

export type RoundEvent =
  | { kind: 'starting'; mode: MatchMode }
  | { kind: 'phase-changed'; phase: 'countdown' | 'playing'; mode: MatchMode }
  | { kind: 'interrupted' }
  | { kind: 'finished'; completion: RoundCompletion }
