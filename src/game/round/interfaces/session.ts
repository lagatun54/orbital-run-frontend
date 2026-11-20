import type { Observable } from 'rxjs'
import type { SessionEvent } from './events.js'

export type StartRound = (name: string, directions: Observable<number>) => Observable<SessionEvent>
