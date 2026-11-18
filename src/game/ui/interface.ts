import type { RoundEvent } from '../round/interfaces/events.js'
import type { MatchFrame, MatchResult } from '../round/interfaces/match.js'
import type { InterfaceActions } from './interfaces/actions.js'
import { createRoundHud } from './round-hud.js'
import { createJoystick } from './joystick.js'
import { createRecords } from './records.js'

const briefing = 'За 30 секунд соберите больше звёздочек, чем бот.'

export function createInterface(actions: InterfaceActions, signal: AbortSignal) {
  const root = document.createElement('main')
  root.className = 'game'
  root.innerHTML = `
    <div class="arena" role="img" aria-label="Арена с двумя бумажными самолётиками и звёздочками"></div>
    <form class="game-menu">
      <canvas class="paper-sheet" data-artwork="flight-sheet" aria-hidden="true"></canvas>
      <div class="flight-illustration" aria-hidden="true">
        <span class="flight-route flight-route-you"></span>
        <span class="flight-route flight-route-bot"></span>
        <canvas class="flight-plane flight-plane-you" data-artwork="player-plane-right"></canvas>
        <canvas class="flight-plane flight-plane-bot" data-artwork="enemy-plane-left"></canvas>
        <canvas class="flight-star" data-artwork="paper-star"></canvas>
      </div>
      <div class="flight-brief">
        <div>
          <h1>Орбитальный сбор</h1>
          <p class="mission">${briefing}</p>
        </div>
        <div class="flight-result" hidden>
          <span class="result-you">Вы <b data-result-player></b></span>
          <span class="result-bot">Бот <b data-result-bot></b></span>
        </div>
        <div class="flight-actions">
          <label class="pilot-field">Имя пилота
            <input type="text" placeholder="По желанию" autocomplete="nickname" maxlength="40">
          </label>
          <button class="launch-button" type="submit" disabled>
            <canvas class="launch-paper" data-artwork="launch-paper" aria-hidden="true"></canvas>
            <span class="launch-label">Взлететь</span>
            <span class="launch-mark" aria-hidden="true">
              <canvas class="launch-plane" data-artwork="player-plane-right"></canvas>
              <canvas class="launch-glint" data-artwork="paper-star"></canvas>
            </span>
          </button>
        </div>
      </div>
    </form>
    <div class="flight-controls" hidden>
      <p>Коснитесь или потяните<br>в сторону полёта</p>
    </div>
    <footer class="game-footer">
      <p class="game-status" role="status">Загружаем арену…</p>
      <p class="game-shortcuts" hidden><kbd>WASD</kbd> <span>или</span> <kbd>↑ ↓ ← →</kbd></p>
    </footer>`

  const get = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!
  const arena = get('.arena')
  const menu = get<HTMLFormElement>('.game-menu')
  const title = get('h1')
  const mission = get('.mission')
  const resultSheet = get('.flight-result')
  const resultPlayer = get('[data-result-player]')
  const resultBot = get('[data-result-bot]')
  const nameField = get('.pilot-field')
  const pilot = get<HTMLInputElement>('input')
  const play = get<HTMLButtonElement>('button[type="submit"]')
  const launchLabel = get('.launch-label')
  const launchPlane = get('.launch-plane')
  const flightControls = get('.flight-controls')
  const shortcuts = get('.game-shortcuts')
  const status = get('.game-status')
  const joystick = createJoystick(actions, signal)
  const records = createRecords(announce, signal)
  const compact = matchMedia('(max-width: 980px), (max-height: 520px), (any-pointer: coarse)')
  const touchInput = matchMedia('(max-width: 640px), (any-pointer: coarse)')
  const hud = createRoundHud()
  root.prepend(hud.scoreboard)
  menu.after(hud.countdown)
  flightControls.prepend(joystick.root)
  root.append(records.root)
  let menuFade: Animation | undefined

  function announce(message: string) {
    status.textContent = message
  }

  async function start() {
    if (play.disabled || menu.hidden || play.classList.contains('is-launching')) return
    const name = Array.from(pilot.value.trim()).slice(0, 20).join('')
    play.classList.add('is-launching')
    play.setAttribute('aria-disabled', 'true')
    const flight = launchPlane.getAnimations()[0]
    if (flight) await flight.finished.catch(() => {})
    play.removeAttribute('aria-disabled')
    if (!signal.aborted) actions.dispatch({ kind: 'start', name })
  }

  async function leaveMenu() {
    menu.inert = true
    pilot.blur()
    menu.classList.add('is-leaving')
    const fade = menuFade = menu.getAnimations()[0]
    if (fade) await fade.finished.catch(() => {})
    if (signal.aborted || !menu.inert || menuFade !== fade) return
    menu.hidden = true
    menu.classList.remove('is-leaving')
    play.classList.remove('is-launching')
  }

  function updateLayout() {
    root.classList.toggle('is-compact', compact.matches)
    records.setCompact(compact.matches)
    joystick.setAvailable(touchInput.matches)
    flightControls.hidden = !(menu.hidden || menu.inert) || !touchInput.matches
    shortcuts.hidden = touchInput.matches
  }

  function showStart(heading: string, action: string, result?: MatchResult) {
    menuFade = undefined
    root.classList.remove('is-playing')
    menu.hidden = false
    menu.inert = false
    menu.classList.remove('is-leaving')
    play.classList.remove('is-launching')
    hud.hideCountdown()
    joystick.setEnabled(false)
    flightControls.hidden = true
    title.textContent = heading
    mission.textContent = result ? 'Итоговый счёт' : briefing
    menu.classList.toggle('has-result', !!result)
    resultSheet.hidden = !result
    if (result) {
      resultPlayer.textContent = String(result.score)
      resultBot.textContent = String(result.botScore)
    }
    nameField.hidden = !!result
    launchLabel.textContent = action
    play.disabled = false
  }

  const round = {
    announce,
    setStartEnabled(value: boolean) { play.disabled = !value },
    showFrame(frame: MatchFrame) {
      hud.showScore(frame)
      if (frame.phase !== 'finished') hud.showCountdown(frame)
    },
    handleEvent(event: RoundEvent) {
      switch (event.kind) {
        case 'starting':
          play.disabled = true
          if (event.mode === 'online') {
            launchLabel.textContent = 'Подключение…'
            announce('Подключаемся к арене.')
          }
          break
        case 'phase-changed': {
          if (!menu.hidden && !menu.inert) {
            root.classList.add('is-playing')
            void leaveMenu()
            records.setExpanded(false)
            joystick.setEnabled(true)
            flightControls.hidden = !touchInput.matches
          }
          const message = event.phase === 'countdown' ? 'Готовьтесь к старту.' : 'Раунд начался. Собирайте звёздочки!'
          announce(event.mode === 'local' ? 'Локальная игра с ботом. ' + message : message)
          break
        }
        case 'interrupted':
          showStart('Связь прервалась', 'Играть локально')
          announce('Сервер отключился. Можно начать новый раунд с ботом.')
          break
        case 'finished': {
          const { result } = event.completion
          const { score, botScore } = result
          const outcome = score > botScore ? 'Победа!' : score < botScore ? 'Бот победил' : 'Ничья'
          showStart(outcome, 'Играть ещё', result)
          break
        }
      }
    },
  }

  menu.addEventListener('submit', event => {
    event.preventDefault()
    start()
  }, { signal })
  window.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.repeat ||
        (event.target instanceof Element && event.target.closest('input, button, .leaderboard'))) return
    if (event.code === 'KeyR' && records.toggle()) event.preventDefault()
    else if (event.key === 'Enter' && !menu.hidden) start()
  }, { signal })

  return {
    arena, round, records: records.view,
    artwork: root.querySelectorAll<HTMLCanvasElement>('canvas[data-artwork]'),
    init() {
      updateLayout()
      document.body.append(root)
      for (const query of [compact, touchInput]) query.addEventListener('change', updateLayout, { signal })
      signal.addEventListener('abort', () => root.remove(), { once: true })
    },
  }
}
