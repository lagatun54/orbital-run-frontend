import type { ArenaFrame, ShipPose } from '../../arena/interfaces/frame.js'

export type MatchMode = 'online' | 'local'

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
