import type { MatchMode, RoundState } from './state.js'
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
  renderer: ArenaRenderer
  view: RoundView
  controls: RoundInput
  results: RoundResults
  startLocal: StartRound
  startOnline?: StartRound
}

export interface RoundController {
  dispose(): void
  getState(): RoundState
  start(name: string): void
  isActive(): boolean
  setDirection(direction: number): void
}

interface MatchConnection {
  session?: RoundSession
  sentDirection: number
}

export function createRoundController({
  renderer, view, controls, results, startLocal, startOnline,
}: RoundDependencies): RoundController {
  let state: RoundState = { phase: 'ready', mode: startOnline ? 'online' : 'local' }
  let active: MatchConnection | undefined
  let generation = 0
  let disposed = false

  function setDirection(direction: number): void {
    if (!active?.session || (state.phase !== 'countdown' && state.phase !== 'playing') ||
        direction === active.sentDirection) return
    active.session.setDirection(direction)
    active.sentDirection = direction
  }

  function closeSession(): void {
    const session = active?.session
    active = undefined
    session?.close()
  }

  function begin(name: string, mode: MatchMode, startRound: StartRound): void {
    const match: MatchConnection = { sentDirection: -1 }
    active = match

    function disconnect() {
      if (active !== match) return
      active = undefined
      controls.clear()
      if (state.phase === 'finished') {
        view.setStartEnabled(true)
        return
      }
      if (state.phase === 'connecting') {
        beginLocal(name)
        return
      }
      state = { phase: 'ready', mode: 'local', reason: 'disconnected' }
      view.showStart('Связь прервалась', 'Играть локально', true)
      view.announce('Сервер отключился. Можно начать новый раунд с ботом.')
    }

    const session = startRound(name, {
      update(update) {
        if (active === match && state.phase !== 'finished') showUpdate(update, mode)
      },
      disconnect,
    })
    if (active === match) {
      match.session = session
      setDirection(controls.direction())
    } else {
      session.close()
    }
  }

  function beginLocal(name: string): void {
    state = { phase: 'starting', mode: 'local' }
    results.clear(false)
    begin(name, 'local', startLocal)
  }

  function showUpdate(update: RoundUpdate, mode: MatchMode): void {
    const previous = state.phase
    const { frame } = update
    const { phase } = frame
    state = update.kind === 'frame'
      ? { phase, mode, frame }
      : { phase, mode, frame, result: update.result }
    renderer.render(frame, previous === 'connecting' || previous === 'starting')

    if (update.kind === 'frame') {
      view.showRound(update.frame)
      if (phase !== previous) {
        const message = phase === 'countdown' ? 'Готовьтесь к старту.' : 'Раунд начался. Собирайте звёздочки!'
        view.announce(mode === 'local' ? 'Локальная игра с ботом. ' + message : message)
        setDirection(controls.direction())
      }
      return
    }

    if (update.kind === 'local-result') {
      closeSession()
    }
    controls.clear()
    view.showScore(update.frame)
    const { score, botScore } = update.result
    const outcome = score > botScore ? 'Победа!' : score < botScore ? 'Бот победил' : 'Ничья'
    view.showStart(outcome, 'Играть ещё', active === undefined, update.result)

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
      closeSession()
    },
    start(name) {
      if (disposed || active || (state.phase !== 'ready' && state.phase !== 'finished')) return
      generation++
      controls.clear()
      view.setStartEnabled(false)
      if (state.mode === 'local' || !startOnline) {
        beginLocal(name)
      } else {
        state = { phase: 'connecting', mode: 'online' }
        view.showConnecting()
        view.announce('Подключаемся к арене.')
        begin(name, 'online', startOnline)
      }
    },
    getState: () => state,
    isActive: () => active?.session !== undefined && state.phase !== 'finished',
    setDirection,
  }
}
