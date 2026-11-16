import type { AppStateStore, MatchMode } from '../../app/state.js'
import type { ArenaRenderer } from '../arena/model.js'
import type { LocalResult, MatchFrame, MatchResult, RoundSession, RoundUpdate, StartRound } from './model.js'

export interface RoundView {
  setStartEnabled(enabled: boolean): void
  showConnecting(): void
  showStart(title: string, action: string, enabled: boolean, result?: MatchResult): void
  showRound(frame: MatchFrame): void
  showScore(frame: MatchFrame): void
  announce(message: string): void
}

export interface RoundResults {
  clear(online: boolean): void
  online(id: string, isCurrent: () => boolean): void
  local(result: LocalResult, isCurrent: () => boolean): void
}

interface RoundInput {
  clear(): void
  direction(): number
}

interface RoundDependencies {
  state: AppStateStore
  renderer: ArenaRenderer
  view: RoundView
  controls: RoundInput
  results: RoundResults
  startLocal: StartRound
  startOnline?: StartRound
}

export interface RoundController {
  dispose(): void
  start(name: string): void
  isActive(): boolean
  setDirection(direction: number): void
}

export function createRoundController({
  state, renderer, view, controls, results, startLocal, startOnline,
}: RoundDependencies): RoundController {
  let session: RoundSession | undefined
  let generation = 0
  let sentDirection = -1
  let disposed = false

  function setDirection(direction: number): void {
    const { phase } = state.get()
    if (!session || (phase !== 'countdown' && phase !== 'playing') ||
        direction === sentDirection) return
    session.setDirection(direction)
    sentDirection = direction
  }

  function begin(name: string, mode: MatchMode, startRound: StartRound): void {
    sentDirection = -1
    session = startRound(name, {
      update(update) {
        if (!disposed) showUpdate(update, mode)
      },
      disconnect() {
        if (disposed) return
        const { phase } = state.get()
        session = undefined
        controls.clear()
        if (phase === 'finished') {
          view.setStartEnabled(true)
          return
        }
        if (phase === 'connecting') {
          beginLocal(name)
          return
        }
        state.set({ phase: 'ready', mode: 'local', reason: 'disconnected' })
        view.showStart('Связь прервалась', 'Играть локально', true)
        view.announce('Сервер отключился. Можно начать новый раунд с ботом.')
      },
    })
  }

  function beginLocal(name: string): void {
    state.set({ phase: 'starting', mode: 'local' })
    results.clear(false)
    begin(name, 'local', startLocal)
  }

  function showUpdate(update: RoundUpdate, mode: MatchMode): void {
    const previous = state.get().phase
    const { frame } = update
    const { phase } = frame
    state.set(update.kind === 'frame'
      ? { phase, mode, frame }
      : { phase, mode, frame, result: update.result })
    renderer.render(frame, previous === 'connecting' || previous === 'starting')

    if (update.kind === 'frame') {
      view.showRound(update.frame)
      if (phase !== previous) {
        const message = phase === 'countdown' ? 'Готовьтесь к старту.' : 'Раунд начался. Собирайте кристаллы!'
        view.announce(mode === 'local' ? 'Локальная игра с ботом. ' + message : message)
        setDirection(controls.direction())
      }
      return
    }

    if (update.kind === 'local-result') {
      session?.close()
      session = undefined
    }
    controls.clear()
    view.showScore(update.frame)
    const { score, botScore } = update.result
    const outcome = score > botScore ? 'Победа!' : score < botScore ? 'Бот победил' : 'Ничья'
    view.showStart(outcome, 'Играть ещё', session === undefined, update.result)

    const finishedGeneration = generation
    const isCurrent = () => generation === finishedGeneration
    if (update.kind === 'local-result') {
      results.local(update.result, isCurrent)
    } else {
      results.clear(true)
      view.announce(update.queued
        ? 'Результат отправлен в таблицу рекордов.'
        : 'Сервис рекордов недоступен. Очки показаны на табло.')
      if (update.queued) results.online(update.result.id, isCurrent)
    }
  }

  return {
    dispose() {
      disposed = true
      generation++
      session?.close()
      session = undefined
    },
    start(name) {
      const current = state.get()
      if (disposed || session || (current.phase !== 'ready' && current.phase !== 'finished')) return
      generation++
      controls.clear()
      view.setStartEnabled(false)
      if (current.mode === 'local' || !startOnline) {
        beginLocal(name)
      } else {
        state.set({ phase: 'connecting', mode: 'online' })
        view.showConnecting()
        view.announce('Подключаемся к арене.')
        begin(name, 'online', startOnline)
      }
    },
    isActive: () => session !== undefined && state.get().phase !== 'finished',
    setDirection,
  }
}
