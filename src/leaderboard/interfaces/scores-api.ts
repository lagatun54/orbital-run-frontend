import type { LocalResult } from '../../game/round/interfaces/match.js'
import type { LeaderboardEntry } from './leaderboard.js'

export interface ScoresApi {
  entries(signal: AbortSignal): Promise<readonly LeaderboardEntry[]>
  submit(result: LocalResult, signal: AbortSignal): Promise<'saved' | 'rejected' | 'unavailable'>
  rank(id: string, signal: AbortSignal, timeoutMs: number): Promise<
    { place: number; score: number } | 'retry' | 'unavailable'
  >
}
