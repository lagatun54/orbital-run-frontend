export interface JoystickActions {
  press(pointer: number, direction: number): void
  release(pointer: number): void
}

export interface InterfaceActions extends JoystickActions {
  startRound(name: string): void
  sound: {
    readonly muted: boolean
    launch(): void
    toggleMuted(): void
  }
}
