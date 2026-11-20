import { Subject } from 'rxjs'
import { Direction } from './direction.js'

const keys = new Map([
  ['KeyW', Direction.Up], ['ArrowUp', Direction.Up],
  ['KeyS', Direction.Down], ['ArrowDown', Direction.Down],
  ['KeyA', Direction.Left], ['ArrowLeft', Direction.Left],
  ['KeyD', Direction.Right], ['ArrowRight', Direction.Right],
])

export function createFlightControls() {
  const directions = new Subject<number>()
  const pressed = new Map<string, number>()
  const pointers = new Map<number, number>()
  let mask = 0

  function update(): void {
    let next = 0
    for (const key of pressed.values()) next |= key
    for (const touch of pointers.values()) next |= touch
    if (next === mask) return
    mask = next
    directions.next(mask)
  }

  function clear(): void {
    pressed.clear()
    pointers.clear()
    update()
  }

  function bindKeyboard(enabled: () => boolean, signal: AbortSignal): void {
    window.addEventListener('keydown', event => {
      const key = keys.get(event.code)
      if (key === undefined || !enabled()) return
      event.preventDefault()
      pressed.set(event.code, key)
      update()
    }, { signal })
    window.addEventListener('keyup', event => {
      if (pressed.delete(event.code)) update()
    }, { signal })
    window.addEventListener('blur', clear, { signal })
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clear()
    }, { signal })
  }

  return {
    bindKeyboard, clear,
    directions: directions.asObservable(),
    direction: () => mask,
    pressPointer(pointerId: number, direction: number) {
      pointers.set(pointerId, direction)
      update()
    },
    releasePointer(pointerId: number) {
      if (pointers.delete(pointerId)) update()
    },
  }
}
