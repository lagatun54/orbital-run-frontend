import { createScene, standby } from '../game/arena/scene.js'
import { createFlightControls } from '../game/controls.js'
import { createRoundController, type RoundController } from '../game/round/controller.js'
import { createOnlineMatch } from '../game/round/online-session.js'
import { startLocalRound } from '../game/round/practice.js'
import { createInterface } from '../game/ui/interface.js'
import { createScoresApi } from '../leaderboard/scores-api.js'
import { createLeaderboard } from '../leaderboard/sync.js'
import { getBackendOrigin } from './config.js'

const lifetime = new AbortController()
const { signal } = lifetime
let startupState: { phase: 'loading' } | { phase: 'error'; error: unknown } = { phase: 'loading' }
let controller: RoundController | undefined
let destroyScene: (() => void) | undefined

if (import.meta.env.DEV) {
  Object.defineProperty(window, 'orbitalRunState', {
    get: () => controller?.getState() ?? startupState,
    configurable: true,
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

const controls = createFlightControls(direction => controller?.setDirection(direction))
const ui = createInterface({
  start: name => controller?.start(name),
  press: (pointer, direction) => {
    if (controller?.isActive()) controls.pressPointer(pointer, direction)
  },
  release: controls.releasePointer,
}, signal)

try {
  ui.init()
  const backendOrigin = getBackendOrigin()
  const renderer = await createScene(ui.arena)
  if (signal.aborted) {
    renderer.destroy()
  } else {
    destroyScene = renderer.destroy
    renderer.render(standby, true)
    const api = backendOrigin ? createScoresApi(backendOrigin) : null
    const results = createLeaderboard(api, ui.records, signal)
    controller = createRoundController({
      renderer, view: ui.round, controls, results,
      startLocal: startLocalRound,
      startOnline: backendOrigin ? createOnlineMatch(backendOrigin) : undefined,
    })
    controls.bindKeyboard(controller.isActive, signal)
    ui.round.setStartEnabled(true)
    ui.round.announce(backendOrigin ? 'Арена готова.' : 'Доступна локальная игра с ботом.')
  }
} catch (error) {
  if (!signal.aborted) {
    disposeGame()
    controller = undefined
    startupState = { phase: 'error', error }
    ui.round.announce('Не удалось загрузить игру.')
    console.error(error)
  }
}
