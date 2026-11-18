import type { SessionEvent } from './events.js'

export interface RoundSession {
  setDirection(direction: number): void
  close(): void
}

export type StartRound = (name: string, emit: (event: SessionEvent) => void) => RoundSession
