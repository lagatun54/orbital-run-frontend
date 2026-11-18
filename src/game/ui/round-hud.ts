import { ROUND_DURATION_MS } from '../round/constants.js'
import type { MatchFrame } from '../round/interfaces/match.js'

export function createRoundHud() {
  const scoreboard = document.createElement('div')
  scoreboard.className = 'scoreboard'
  scoreboard.setAttribute('role', 'group')
  scoreboard.setAttribute('aria-label', 'Табло')
  scoreboard.innerHTML = `
    <canvas class="paper-sheet" data-artwork="score-strip" aria-hidden="true"></canvas>
    <div class="score-side score-you"><canvas class="score-plane" data-artwork="player-plane-right" aria-hidden="true"></canvas><span>Вы</span><b data-player>00</b></div>
    <div class="score-clock"><span>Время</span><b data-clock>00:30</b><div class="time-track" aria-hidden="true"></div></div>
    <div class="score-side score-bot"><canvas class="score-plane" data-artwork="enemy-plane-left" aria-hidden="true"></canvas><span>Бот</span><b data-bot>00</b></div>`
  const clock = scoreboard.querySelector<HTMLElement>('[data-clock]')!
  const timer = scoreboard.querySelector<HTMLElement>('.score-clock')!
  const track = scoreboard.querySelector<HTMLElement>('.time-track')!
  const player = scoreboard.querySelector<HTMLElement>('[data-player]')!
  const bot = scoreboard.querySelector<HTMLElement>('[data-bot]')!

  const countdown = document.createElement('div')
  countdown.className = 'countdown'
  countdown.setAttribute('aria-hidden', 'true')
  const countdownDigit = document.createElement('span')
  countdown.append(countdownDigit)

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  let countdownPulse: Animation | undefined
  let clockPulse: Animation | undefined
  let lastSeconds = ROUND_DURATION_MS / 1000
  let lastProgress = 1
  let lastPlayerScore = 0
  let lastBotScore = 0
  let wasUrgent = false
  let countdownSeconds = 0

  function showScore(frame: MatchFrame) {
    const ms = frame.phase === 'countdown' ? ROUND_DURATION_MS : frame.remainingMs
    const urgent = frame.phase === 'playing' && ms > 0 && ms <= 5000
    if (urgent !== wasUrgent) {
      timer.classList.toggle('is-urgent', urgent)
      wasUrgent = urgent
    }
    const progress = Math.min(1, Math.max(0, ms / ROUND_DURATION_MS))
    if (progress !== lastProgress) {
      track.style.setProperty('--time-left', String(progress))
      lastProgress = progress
    }
    const seconds = Math.ceil(ms / 1000)
    if (seconds !== lastSeconds) {
      lastSeconds = seconds
      clockPulse?.cancel()
      clock.textContent = '00:' + String(seconds).padStart(2, '0')
      if (urgent && !reducedMotion.matches) {
        clockPulse = clock.animate([
          { opacity: 0, transform: 'scale(1.15)' },
          { opacity: 1, transform: 'scale(1)' },
        ], { duration: 520, easing: 'cubic-bezier(0.22, 0.72, 0.32, 1)' })
      }
    }
    if (frame.player.score !== lastPlayerScore) {
      lastPlayerScore = frame.player.score
      player.textContent = String(lastPlayerScore).padStart(2, '0')
    }
    if (frame.bot.score !== lastBotScore) {
      lastBotScore = frame.bot.score
      bot.textContent = String(lastBotScore).padStart(2, '0')
    }
  }

  function hideCountdown() {
    if (countdownSeconds === 0) return
    countdownSeconds = 0
    countdown.classList.remove('is-visible')
  }

  function showCountdown(frame: MatchFrame) {
    if (frame.phase !== 'countdown') {
      hideCountdown()
      return
    }

    const seconds = Math.max(1, Math.ceil(frame.remainingMs / 1000))
    if (seconds === countdownSeconds) return
    if (countdownSeconds === 0) countdown.classList.add('is-visible')
    countdownSeconds = seconds

    countdownPulse?.cancel()
    countdownDigit.textContent = String(seconds)
    if (!reducedMotion.matches) {
      countdownPulse = countdownDigit.animate([
        { opacity: 0, transform: 'scale(1.45)' },
        { opacity: 1, transform: 'scale(1)' },
      ], { duration: 740, easing: 'cubic-bezier(0.22, 0.72, 0.32, 1)' })
    }
  }

  return {
    scoreboard, countdown, showScore, showCountdown, hideCountdown,
  }
}
