import { Direction } from '../direction.js'
import type { JoystickActions } from './interfaces/actions.js'

const diagonalThreshold = Math.tan(Math.PI / 8)

export function createJoystick(actions: JoystickActions, signal: AbortSignal) {
  const root = document.createElement('div')
  root.className = 'joystick'
  root.hidden = true
  root.setAttribute('role', 'group')
  root.setAttribute('aria-label', 'Управление полётом: джойстик, WASD или стрелки')
  root.innerHTML = `
    <svg class="joystick-dial" viewBox="0 0 120 120" aria-hidden="true">
      <circle class="joystick-paper" cx="60" cy="60" r="57" />
      <circle class="joystick-track" cx="60" cy="60" r="41" />
      <path class="joystick-ticks" d="M32 32l4 4m48 48 4 4m0-56-4 4M36 84l-4 4" />
      <path class="joystick-marks" d="m56 16 4-4 4 4m40 40 4 4-4 4M56 104l4 4 4-4M16 56l-4 4 4 4" />
    </svg>
    <div class="joystick-knob" aria-hidden="true"><canvas data-artwork="paper-star"></canvas></div>`
  const knob = root.querySelector<HTMLElement>('.joystick-knob')!
  let available = false
  let enabled = false
  let pointer: number | undefined
  let bounds: DOMRect

  function steer(event: PointerEvent) {
    const radius = bounds.width / 2
    const x = event.clientX - bounds.left - radius
    const y = event.clientY - bounds.top - radius
    const distance = Math.hypot(x, y)
    const travel = Math.min(1, radius * 0.52 / (distance || 1))
    knob.style.setProperty('--stick-x', `${x * travel}px`)
    knob.style.setProperty('--stick-y', `${y * travel}px`)
    let direction = 0
    if (distance >= radius * 0.16) {
      if (Math.abs(x) > Math.abs(y) * diagonalThreshold) direction |= x < 0 ? Direction.Left : Direction.Right
      if (Math.abs(y) > Math.abs(x) * diagonalThreshold) direction |= y < 0 ? Direction.Up : Direction.Down
    }
    actions.press(event.pointerId, direction)
  }

  function reset() {
    if (pointer === undefined) return
    const id = pointer
    pointer = undefined
    root.classList.remove('is-held')
    knob.style.removeProperty('--stick-x')
    knob.style.removeProperty('--stick-y')
    if (root.hasPointerCapture(id)) root.releasePointerCapture(id)
    actions.release(id)
  }

  root.addEventListener('pointerdown', event => {
    if (!enabled || pointer !== undefined || event.button !== 0) return
    event.preventDefault()
    bounds = root.getBoundingClientRect()
    root.setPointerCapture(event.pointerId)
    pointer = event.pointerId
    root.classList.add('is-held')
    steer(event)
  }, { signal })
  root.addEventListener('pointermove', event => {
    if (event.pointerId === pointer) steer(event)
  }, { signal })
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    root.addEventListener(type, event => { if (event.pointerId === pointer) reset() }, { signal })
  }
  window.addEventListener('resize', reset, { signal })
  window.addEventListener('blur', reset, { signal })
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset() }, { signal })
  signal.addEventListener('abort', reset, { once: true })

  function updateVisibility() {
    root.hidden = !available || !enabled
    if (root.hidden) reset()
  }

  return {
    root,
    setEnabled(value: boolean) {
      enabled = value
      updateVisibility()
    },
    setAvailable(value: boolean) {
      available = value
      updateVisibility()
    },
  }
}
