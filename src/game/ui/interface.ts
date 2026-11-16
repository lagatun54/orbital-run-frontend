import type { RoundView } from '../round/controller.js'
import { ROUND_DURATION_MS, type MatchFrame } from '../round/model.js'
import { createJoystick } from './joystick.js'
import { createRecords } from './records.js'

interface Actions {
  start(name: string): void
  press(pointer: number, direction: number): void
  release(pointer: number): void
}

const briefing = 'Соберите больше кристаллов, чем бот, за 30 секунд.'

export function createInterface(actions: Actions, signal: AbortSignal) {
  const root = document.createElement('main')
  root.className = 'game'
  root.innerHTML = `
    <div class="scoreboard" role="group" aria-label="Табло">
      <div class="score-you">Вы <b data-player>00</b></div>
      <div class="score-clock">Время <b data-clock>00:30</b><div class="time-track" aria-hidden="true"></div></div>
      <div class="score-bot">Бот <b data-bot>00</b></div>
    </div>
    <div class="arena-slot">
      <div class="arena" role="img" aria-label="Арена с ракетами и кристаллами">
        <div class="countdown" hidden aria-hidden="true"></div>
      </div>
    </div>
    <div class="game-sidebar">
      <div class="flight-deck">
        <form class="game-menu">
          <h1>Орбитальный сбор</h1>
          <p class="mission">${briefing}</p>
          <label class="pilot-field">Имя пилота <small>· по желанию</small>
            <input type="text" placeholder="Пилот" autocomplete="nickname" maxlength="40">
          </label>
          <button type="submit" disabled>Играть <span aria-hidden="true">▶</span></button>
        </form>
        <div class="flight-controls" hidden>
          <p><strong>Управление</strong>Нажмите или потяните в сторону полёта.</p>
        </div>
      </div>
    </div>
    <footer class="game-footer">
      <p class="game-status" role="status">Загружаем арену…</p>
      <p class="game-shortcuts" hidden>WASD / ↑ ↓ ← →</p>
    </footer>`

  const get = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!
  const arena = get('.arena')
  const menu = get<HTMLFormElement>('.game-menu')
  const title = get('h1')
  const mission = get('.mission')
  const nameField = get('.pilot-field')
  const pilot = get<HTMLInputElement>('input')
  const play = get<HTMLButtonElement>('button[type="submit"]')
  const countdown = get('.countdown')
  const flightControls = get('.flight-controls')
  const shortcuts = get('.game-shortcuts')
  const status = get('.game-status')
  const clock = get('[data-clock]')
  const timer = get('.score-clock')
  const player = get('[data-player]')
  const bot = get('[data-bot]')

  const joystick = createJoystick(actions, signal)
  const records = createRecords(announce, signal)
  const compact = matchMedia('(max-width: 760px), (max-height: 520px), (any-pointer: coarse)')
  const touchInput = matchMedia('(max-width: 640px), (any-pointer: coarse)')
  flightControls.prepend(joystick.root)
  get('.game-sidebar').append(records.root)

  function announce(message: string) {
    status.textContent = message
  }

  function setAction(action: string) {
    const arrow = document.createElement('span')
    arrow.textContent = ' ▶'
    arrow.setAttribute('aria-hidden', 'true')
    play.replaceChildren(action, arrow)
  }

  function start() {
    if (play.disabled || menu.hidden) return
    actions.start(Array.from(pilot.value.trim()).slice(0, 20).join(''))
  }

  function updateLayout() {
    root.classList.toggle('is-compact', compact.matches)
    records.setCompact(compact.matches)
    joystick.setAvailable(touchInput.matches)
    flightControls.hidden = !menu.hidden || !touchInput.matches
    shortcuts.hidden = touchInput.matches
  }

  function showScore(frame: MatchFrame) {
    const ms = frame.phase === 'countdown' ? ROUND_DURATION_MS : frame.remainingMs
    timer.classList.toggle('is-urgent', ms > 0 && ms <= 5000)
    timer.style.setProperty('--time-left', String(Math.min(1, Math.max(0, ms / ROUND_DURATION_MS))))
    clock.textContent = '00:' + String(Math.ceil(ms / 1000)).padStart(2, '0')
    player.textContent = String(frame.player.score).padStart(2, '0')
    bot.textContent = String(frame.bot.score).padStart(2, '0')
  }

  const round: RoundView = {
    announce, showScore,
    setStartEnabled(value) { play.disabled = !value },
    showConnecting() { play.textContent = 'Подключение…' },
    showStart(heading, action, canPlay, result) {
      menu.hidden = false
      countdown.hidden = true
      joystick.setEnabled(false)
      flightControls.hidden = true
      title.textContent = heading
      mission.textContent = result ? `Итоговый счёт · ${result.score} : ${result.botScore}` : briefing
      nameField.hidden = !!result
      setAction(action)
      play.disabled = !canPlay
    },
    showRound(frame) {
      showScore(frame)
      if (!menu.hidden) {
        pilot.blur()
        menu.hidden = true
        records.setExpanded(false)
        joystick.setEnabled(true)
        flightControls.hidden = !touchInput.matches
      }
      countdown.hidden = frame.phase !== 'countdown'
      if (!countdown.hidden) countdown.textContent = String(Math.max(1, Math.ceil(frame.remainingMs / 1000)))
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
    init() {
      updateLayout()
      document.body.append(root)
      for (const query of [compact, touchInput]) query.addEventListener('change', updateLayout, { signal })
      signal.addEventListener('abort', () => root.remove(), { once: true })
    },
  }
}
