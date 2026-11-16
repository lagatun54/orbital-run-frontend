import { Code, ConnectError, createClient } from '@connectrpc/connect'
import { createGrpcWebTransport } from '@connectrpc/connect-web'
import { LeaderboardService } from '../gen/scores/v1/leaderboard_service_pb.js'
import { ResultsService } from '../gen/scores/v1/results_service_pb.js'
import type { RoundResults } from '../game/round/controller.js'
import { forgetLocalResult, pendingLocalResults, saveLocalResult } from './pending-results.js'

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

export function createLeaderboard(
  origin: string | null,
  view: LeaderboardView,
  signal: AbortSignal,
): RoundResults {
  const transport = origin === null ? null : createGrpcWebTransport({ baseUrl: origin })
  const leaderboard = transport && createClient(LeaderboardService, transport)
  const results = transport && createClient(ResultsService, transport)
  let selectedId: string | undefined
  let syncing = false
  let latestLocal: { id: string; isCurrent: () => boolean } | undefined

  if (origin === null) {
    showLocalEntries()
  } else {
    void refresh()
    void syncLocal()
    window.addEventListener('online', syncLocal, { signal })
    window.addEventListener('focus', syncLocal, { signal })
    const timer = window.setInterval(syncLocal, 20_000)
    signal.addEventListener('abort', () => window.clearInterval(timer), { once: true })
  }

  return {
    clear(online) {
      if (online) selectedId = undefined
      view.hideResult(online)
    },
    online(id, isCurrent) { void waitForResult(id, isCurrent) },
    local(result, isCurrent) {
      latestLocal = { id: result.id, isCurrent }
      const stored = saveLocalResult(result)
      if (origin === null) {
        selectedId = result.id
        showLocalEntries()
        view.announce(stored ? 'Рекорд сохранён на этом устройстве.' : 'Рекорд сохранён в этой вкладке.')
        return
      }
      view.announce(stored
        ? 'Локальный результат сохранён. Отправим его в рейтинг, когда сервер ответит.'
        : 'Результат сохранён в этой вкладке. Оставьте её открытой до отправки.')
      void syncLocal()
    },
  }

  function showLocalEntries() {
    const entries = Array.from(pendingLocalResults(), result => ({ ...result, local: true }))
      .sort((a, b) => b.score - a.score)
    view.showEntries(entries, selectedId)
    const place = entries.findIndex(result => result.id === selectedId)
    if (place >= 0) view.showRank(place + 1, entries[place]!.score)
    if (!entries.length) view.showState('Локальных рекордов пока нет')
  }

  async function refresh(): Promise<void> {
    if (!leaderboard || signal.aborted) return
    try {
      const { entries } = await leaderboard.getLeaderboard({}, { signal, timeoutMs: 4000 })
      if (!signal.aborted) view.showEntries(entries, selectedId)
    } catch {
      if (!signal.aborted) view.showState('Таблица рекордов временно недоступна.')
    }
  }

  async function syncLocal(): Promise<void> {
    if (!results || syncing || signal.aborted) return
    syncing = true
    let changed = false
    try {
      for (const { id, name, score, botScore } of pendingLocalResults()) {
        try {
          await results.saveLocalResult({ id, name, score, botScore }, { signal, timeoutMs: 5000 })
        } catch (error) {
          // Keep rejected records without holding up the remaining queue.
          if (ConnectError.from(error).code === Code.InvalidArgument) continue
          break
        }
        forgetLocalResult(id)
        changed = true
        if (latestLocal?.id === id && latestLocal.isCurrent()) {
          void waitForResult(id, latestLocal.isCurrent)
        }
      }
    } finally {
      syncing = false
      if (changed) void refresh()
    }
  }

  async function waitForResult(id: string, isCurrent: () => boolean): Promise<void> {
    if (!results) return
    const deadline = performance.now() + 12_000
    while (!signal.aborted && isCurrent()) {
      const remaining = Math.ceil(deadline - performance.now())
      if (remaining <= 0) break
      try {
        const { result, rank } = await results.getResult({ id }, { signal, timeoutMs: Math.min(3000, remaining) })
        if (signal.aborted || !isCurrent()) return
        const place = Number(rank)
        if (result && Number.isSafeInteger(place) && place > 0) {
          selectedId = id
          view.showRank(place, result.score)
          view.announce(`Результат сохранён. Место ${place} в рейтинге.`)
          void refresh()
          return
        }
        break
      } catch (error) {
        const { code } = ConnectError.from(error)
        // Fetch failures can appear as Unknown when the server is offline.
        if (code !== Code.NotFound && code !== Code.Unavailable &&
            code !== Code.DeadlineExceeded && code !== Code.Unknown) break
      }
      if (signal.aborted || !isCurrent()) return
      const delay = Math.min(750, deadline - performance.now())
      if (delay <= 0) break
      await new Promise(resolve => window.setTimeout(resolve, delay))
    }
    if (!signal.aborted && isCurrent()) {
      view.announce('Результат ещё обрабатывается и пока не появился в рейтинге.')
    }
  }
}
