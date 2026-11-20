import {
  distinctUntilChanged, distinctUntilKeyChanged, filter, finalize, fromEvent, map, merge, share, takeUntil, tap,
} from 'rxjs'
import { ROUND_DURATION_MS } from '../round/constants.js'
import type { RoundStreams } from '../round/interfaces/controller.js'

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function createRoundHud(round: RoundStreams, signal: AbortSignal) {
  const scoreboard = document.createElement('div')
  scoreboard.className = 'scoreboard'
  scoreboard.setAttribute('role', 'group')
  scoreboard.setAttribute('aria-label', 'Табло')
  scoreboard.innerHTML = `
    <canvas class="paper-sheet" data-artwork="score-strip" aria-hidden="true"></canvas>
    <div class="score-side score-you"><canvas class="score-plane" data-artwork="player-plane-right" aria-hidden="true"></canvas><span>Вы</span><b data-player>00</b></div>
    <div class="score-clock"><span>Время</span><b data-clock>${formatClock(Math.ceil(ROUND_DURATION_MS / 1000))}</b><div class="time-track" aria-hidden="true"></div></div>
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
  const frames = round.frames.pipe(map(({ frame }) => frame))
  const time = frames.pipe(
    map(frame => {
      const ms = frame.phase === 'countdown' ? ROUND_DURATION_MS : frame.remainingMs
      return { ms, urgent: frame.phase === 'playing' && ms > 0 && ms <= 5000 }
    }),
    share(),
  )

  if (!signal.aborted) {
    merge(
      time.pipe(
        map(({ urgent }) => urgent),
        distinctUntilChanged(),
        tap(urgent => timer.classList.toggle('is-urgent', urgent)),
      ),
      time.pipe(
        map(({ ms }) => Math.min(1, Math.max(0, ms / ROUND_DURATION_MS))),
        distinctUntilChanged(),
        tap(progress => track.style.setProperty('--time-left', String(progress))),
      ),
      time.pipe(
        map(({ ms, urgent }) => ({ seconds: Math.ceil(ms / 1000), urgent })),
        distinctUntilKeyChanged('seconds'),
        tap(({ seconds, urgent }) => {
          clockPulse?.cancel()
          clock.textContent = formatClock(seconds)
          if (urgent && !reducedMotion.matches) {
            clockPulse = clock.animate([
              { opacity: 0, transform: 'scale(1.15)' },
              { opacity: 1, transform: 'scale(1)' },
            ], { duration: 520, easing: 'cubic-bezier(0.22, 0.72, 0.32, 1)' })
          }
        }),
      ),
      frames.pipe(
        map(frame => frame.player.score + (frame.pendingPickups?.size ?? 0)),
        distinctUntilChanged(),
        tap(score => { player.textContent = String(score).padStart(2, '0') }),
      ),
      frames.pipe(
        map(frame => frame.bot.score),
        distinctUntilChanged(),
        tap(score => { bot.textContent = String(score).padStart(2, '0') }),
      ),
      merge(
        frames.pipe(map(frame => frame.phase === 'countdown' ? Math.max(1, Math.ceil(frame.remainingMs / 1000)) : 0)),
        round.events.pipe(filter(event => event.kind === 'interrupted'), map(() => 0)),
      ).pipe(
        distinctUntilChanged(),
        tap(showCountdown),
      ),
    ).pipe(
      takeUntil(fromEvent(signal, 'abort')),
      finalize(() => {
        clockPulse?.cancel()
        countdownPulse?.cancel()
      }),
    ).subscribe()
  }

  function showCountdown(seconds: number) {
    countdown.classList.toggle('is-visible', seconds > 0)
    if (seconds === 0) return
    countdownPulse?.cancel()
    countdownDigit.textContent = String(seconds)
    if (!reducedMotion.matches) {
      countdownPulse = countdownDigit.animate([
        { opacity: 0, transform: 'scale(1.45)' },
        { opacity: 1, transform: 'scale(1)' },
      ], { duration: 740, easing: 'cubic-bezier(0.22, 0.72, 0.32, 1)' })
    }
  }

  return { scoreboard, countdown }
}
