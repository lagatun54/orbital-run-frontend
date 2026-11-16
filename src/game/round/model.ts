import type { ArenaFrame, ShipPose } from '../arena/model.js'

export const ROUND_DURATION_MS = 30_000

export interface PilotState extends ShipPose {
  readonly score: number
}

export interface MatchFrame extends ArenaFrame {
  readonly phase: 'countdown' | 'playing' | 'finished'
  readonly remainingMs: number
  readonly player: PilotState
  readonly bot: PilotState
}

export interface MatchResult {
  readonly id: string
  readonly score: number
  readonly botScore: number
}

export interface LocalResult extends MatchResult {
  readonly name: string
}

export interface RoundSession {
  setDirection(direction: number): void
  close(): void
}

export type RoundUpdate =
  | { kind: 'frame'; frame: MatchFrame }
  | { kind: 'online-result'; frame: MatchFrame; result: MatchResult; queued: boolean }
  | { kind: 'local-result'; frame: MatchFrame; result: LocalResult }

export interface RoundEvents {
  update(update: RoundUpdate): void
  disconnect(): void
}

export type StartRound = (name: string, events: RoundEvents) => RoundSession
