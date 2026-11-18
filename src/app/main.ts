import { createScene, standby } from '../game/arena/scene.js'
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

const dispatch = (command: RoundCommand) => controller?.dispatch(command)
const controls = createFlightControls(direction => dispatch({ kind: 'direction', direction }))
const ui = createInterface({
  dispatch,
  press: (pointer, direction) => {
    if (controller?.isActive()) controls.pressPointer(pointer, direction)
  },
  release: controls.releasePointer,
}, signal)

try {
  ui.init()
  const backendOrigin = getBackendOrigin()
  const renderer = await createScene(ui.arena, ui.artwork)
  if (signal.aborted) {
    renderer.destroy()
  } else {
    destroyScene = renderer.destroy
    renderer.render(standby, true)
    const api = backendOrigin ? createScoresApi(backendOrigin) : null
    const results = createLeaderboard(api, ui.records, signal)
    controller = createRoundController({
      store, controls,
      renderFrame(frame, reset) {
        renderer.render(frame, reset)
        ui.round.showFrame(frame)
      },
      publish(event) {
        if (event.kind === 'phase-changed') renderer.setRoundActive(true)
        if (event.kind === 'finished' || event.kind === 'interrupted') renderer.setRoundActive(false)
        ui.round.handleEvent(event)
        results.handleEvent(event)
      },
      startLocal: startLocalRound,
      startOnline: backendOrigin ? createOnlineMatch(backendOrigin) : undefined,
    })
    controls.bindKeyboard(controller.isActive, signal)
    store.transition({ phase: 'ready', mode: backendOrigin ? 'online' : 'local' })
    ui.round.enableStart()
    ui.round.announce(backendOrigin ? 'Арена готова.' : 'Доступна локальная игра с ботом.')
  }
} catch (error) {
  if (!signal.aborted) {
    disposeGame()
    controller = undefined
    store.transition({ phase: 'error', error })
    throw error
  }
}
