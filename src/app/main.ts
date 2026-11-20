import { Subject, map, merge } from 'rxjs'
import { createScene, standby } from '../game/arena/scene.js'
import { createGameAudio } from '../game/audio.js'
import { createFlightControls } from '../game/controls.js'
import { createRoundController } from '../game/round/controller.js'
import type { RoundController } from '../game/round/interfaces/controller.js'
import type { RoundCommand } from '../game/round/interfaces/events.js'
import { createOnlineMatch } from '../game/round/online-session.js'
import { startLocalRound } from '../game/round/practice.js'
import { createInterface } from '../game/ui/interface.js'
import { createScoresApi } from '../leaderboard/scores-api.js'
import { createLeaderboard } from '../leaderboard/sync.js'
import { getBackendOrigin } from './config.js'
import { createAppStore } from './state.js'

const lifetime = new AbortController()
const { signal } = lifetime
const store = createAppStore()
const roundStarts = new Subject<string>()
let controller: RoundController | undefined
let destroyScene: (() => void) | undefined

if (import.meta.env.DEV) {
  Object.defineProperties(window, {
    orbitalRunState: { get: store.getSnapshot, configurable: true },
    orbitalRunStore: {
      value: { getState: store.getState, subscribe: store.subscribe },
      configurable: true,
    },
  })
}

function disposeGame() {
  controller?.dispose()
  destroyScene?.()
  destroyScene = undefined
}

import.meta.hot?.dispose(() => {
  lifetime.abort()
  disposeGame()
})

const controls = createFlightControls()
const commands = merge(
  roundStarts.pipe(map((name): RoundCommand => ({ kind: 'start', name }))),
  controls.directions.pipe(map((direction): RoundCommand => ({ kind: 'direction', direction }))),
)

try {
  const backendOrigin = getBackendOrigin()
  const round = controller = createRoundController({
    store, controls, commands,
    startLocal: startLocalRound,
    startOnline: backendOrigin ? createOnlineMatch(backendOrigin) : undefined,
  })
  const sound = createGameAudio(round, signal)
  const ui = createInterface({
    startRound: name => roundStarts.next(name),
    sound,
    press: (pointer, direction) => {
      if (round.isActive()) controls.pressPointer(pointer, direction)
    },
    release: controls.releasePointer,
  }, round, signal)
  ui.init()
  const renderer = await createScene(ui.arena, ui.artwork)
  if (signal.aborted) {
    renderer.destroy()
  } else {
    destroyScene = renderer.destroy
    renderer.render(standby, true)
    const api = backendOrigin ? createScoresApi(backendOrigin) : null
    createLeaderboard(api, ui.records, round.events, signal)
    round.frames.subscribe(({ frame, reset }) => renderer.render(frame, reset))
    round.events.subscribe(event => {
      if (event.kind === 'phase-changed') renderer.setRoundActive(true)
      if (event.kind === 'finished' || event.kind === 'interrupted') renderer.setRoundActive(false)
    })
    controls.bindKeyboard(round.isActive, signal)
    store.events.initialized(backendOrigin ? 'online' : 'local')
    ui.enableStart()
    ui.announce(backendOrigin ? 'Арена готова.' : 'Доступна локальная игра с ботом.')
  }
} catch (error) {
  if (!signal.aborted) {
    disposeGame()
    controller = undefined
    store.events.initializationFailed(error)
    throw error
  }
}
