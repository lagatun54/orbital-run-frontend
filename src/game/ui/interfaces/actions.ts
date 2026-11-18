import type { RoundCommand } from '../../round/interfaces/events.js'

export interface JoystickActions {
  press(pointer: number, direction: number): void
  release(pointer: number): void
}

export interface InterfaceActions extends JoystickActions {
  dispatch(command: RoundCommand): void
}
