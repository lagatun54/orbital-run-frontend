export interface LeaderboardEntry {
  id: string
  name: string
  score: number
  local: boolean
}

export interface LeaderboardView {
  showEntries(entries: readonly LeaderboardEntry[], selectedId?: string): void
  showState(message: string): void
  hideResult(clearSelection: boolean): void
  showRank(rank: number, score: number): void
  announce(message: string): void
}
