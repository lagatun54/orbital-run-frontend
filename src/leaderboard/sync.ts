import type { RoundEvent } from '../game/round/interfaces/events.js'
import type { LeaderboardView } from './interfaces/leaderboard.js'
import type { ScoresApi } from './interfaces/scores-api.js'
import { forgetLocalResult, pendingLocalResults, saveLocalResult } from './pending-results.js'

export function createLeaderboard(
  api: ScoresApi | null,
  view: LeaderboardView,
  signal: AbortSignal,
) {
  let selectedId: string | undefined
  let syncing = false
  let roundGeneration = 0
  let latestLocal: { id: string; isCurrent: () => boolean } | undefined

  if (!api) {
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
    handleEvent(event: RoundEvent) {
      if (event.kind === 'starting') {
        roundGeneration++
        if (event.mode === 'local') view.hideResult(false)
        return
      }
      if (event.kind !== 'finished') return

      const generation = roundGeneration
      const isCurrent = () => !signal.aborted && generation === roundGeneration
      const { completion } = event
      if (completion.kind === 'online-result') {
        selectedId = undefined
        view.hideResult(true)
        view.announce(completion.queued
          ? 'Результат отправлен в таблицу рекордов.'
          : 'Сервис рекордов недоступен. Очки показаны на табло.')
        if (completion.queued) void waitForResult(completion.result.id, isCurrent)
        return
      }

      const { result } = completion
      latestLocal = { id: result.id, isCurrent }
      const stored = saveLocalResult(result)
      if (!api) {
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
    if (!api || signal.aborted) return
    try {
      const entries = await api.entries(signal)
      if (!signal.aborted) view.showEntries(entries, selectedId)
    } catch {
      if (!signal.aborted) view.showState('Таблица рекордов временно недоступна.')
    }
  }

  async function syncLocal(): Promise<void> {
    if (!api || syncing || signal.aborted) return
    syncing = true
    let changed = false
    try {
      for (const result of pendingLocalResults()) {
        const status = await api.submit(result, signal)
        // Keep rejected records without holding up the remaining queue.
        if (status === 'rejected') continue
        if (status === 'unavailable') break
        const { id } = result
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
    if (!api) return
    const deadline = performance.now() + 12_000
    while (!signal.aborted && isCurrent()) {
      const remaining = Math.ceil(deadline - performance.now())
      if (remaining <= 0) break
      const rank = await api.rank(id, signal, Math.min(3000, remaining))
      if (signal.aborted || !isCurrent()) return
      if (rank === 'unavailable') break
      if (rank !== 'retry') {
        selectedId = id
        view.showRank(rank.place, rank.score)
        view.announce(`Результат сохранён. Место ${rank.place} в рейтинге.`)
        void refresh()
        return
      }
      const delay = Math.min(750, deadline - performance.now())
      if (delay <= 0) break
      await new Promise(resolve => window.setTimeout(resolve, delay))
    }
    if (!signal.aborted && isCurrent()) {
      view.announce('Результат ещё обрабатывается и пока не появился в рейтинге.')
    }
  }
}
