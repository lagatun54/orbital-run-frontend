import { ROUND_DURATION_MS, type MatchFrame } from '../round/model.js'

export function createRoundHud() {
  const scoreboard = document.createElement('div')
  scoreboard.className = 'scoreboard'
  scoreboard.setAttribute('role', 'group')
  scoreboard.setAttribute('aria-label', 'Табло')
  scoreboard.innerHTML = `
    <div class="score-side score-you"><span>Вы</span><b data-player>00</b></div>
    <div class="score-clock"><span>Время</span><b data-clock>00:30</b><div class="time-track" aria-hidden="true"></div></div>
    <div class="score-side score-bot"><span>Бот</span><b data-bot>00</b></div>`
  const clock = scoreboard.querySelector<HTMLElement>('[data-clock]')!
  const timer = scoreboard.querySelector<HTMLElement>('.score-clock')!
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

  function showScore(frame: MatchFrame) {
    const ms = frame.phase === 'countdown' ? ROUND_DURATION_MS : frame.remainingMs
    const urgent = frame.phase === 'playing' && ms > 0 && ms <= 5000
    timer.classList.toggle('is-urgent', urgent)
    timer.style.setProperty('--time-left', String(Math.min(1, Math.max(0, ms / ROUND_DURATION_MS))))
    const time = '00:' + String(Math.ceil(ms / 1000)).padStart(2, '0')
    if (clock.textContent !== time) {
      clockPulse?.cancel()
      clock.textContent = time
      if (urgent && !reducedMotion.matches) {
        clockPulse = clock.animate([
          { opacity: 0, transform: 'scale(1.15)' },
          { opacity: 1, transform: 'scale(1)' },
        ], { duration: 520, easing: 'cubic-bezier(0.22, 0.72, 0.32, 1)' })
      }
    }
    player.textContent = String(frame.player.score).padStart(2, '0')
    bot.textContent = String(frame.bot.score).padStart(2, '0')
  }

  function showCountdown(frame: MatchFrame) {
    const countingDown = frame.phase === 'countdown'
    const wasCountingDown = countdown.classList.contains('is-visible')
    countdown.classList.toggle('is-visible', countingDown)
    if (!countingDown) return

    const digit = String(Math.max(1, Math.ceil(frame.remainingMs / 1000)))
    if (wasCountingDown && countdownDigit.textContent === digit) return

    countdownPulse?.cancel()
    countdownDigit.textContent = digit
    if (!reducedMotion.matches) {
      countdownPulse = countdownDigit.animate([
        { opacity: 0, transform: 'scale(1.45)' },
        { opacity: 1, transform: 'scale(1)' },
      ], { duration: 740, easing: 'cubic-bezier(0.22, 0.72, 0.32, 1)' })
    }
  }

  return {
    scoreboard, countdown, showScore, showCountdown,
    hideCountdown() { countdown.classList.remove('is-visible') },
  }
}
