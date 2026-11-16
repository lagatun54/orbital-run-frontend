const keys = new Map([
  ['KeyW', 1], ['ArrowUp', 1], ['KeyS', 2], ['ArrowDown', 2],
  ['KeyA', 4], ['ArrowLeft', 4], ['KeyD', 8], ['ArrowRight', 8],
])

export function createFlightControls(onChange: (direction: number) => void) {
  const pressed = new Map<string, number>()
  const pointers = new Map<number, number>()
  let mask = 0

  function update(): void {
    let next = 0
    for (const key of pressed.values()) next |= key
    for (const touch of pointers.values()) next |= touch
    if (next === mask) return
    mask = next
    onChange(mask)
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
