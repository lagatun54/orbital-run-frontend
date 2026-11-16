import { createScene, standby } from '../game/arena/scene.js'
import { createFlightControls } from '../game/controls.js'
import { createRoundController, type RoundController } from '../game/round/controller.js'
import { createOnlineMatch } from '../game/round/online-session.js'
import { startLocalRound } from '../game/round/practice.js'
import { createInterface } from '../game/ui/interface.js'
import { createLeaderboard } from '../leaderboard/sync.js'
import { getBackendOrigin } from './config.js'
import { appState } from './state.js'

if (import.meta.env.DEV) {
  Object.defineProperty(window, 'orbitalRunState', { get: appState.get, configurable: true })
}

const lifetime = new AbortController()
let controller: RoundController | undefined
const controls = createFlightControls(direction => controller?.setDirection(direction))
const ui = createInterface({
  start: name => controller?.start(name),
  press: (pointer, direction) => {
    if (controller?.isActive()) controls.pressPointer(pointer, direction)
  },
  release: controls.releasePointer,
}, lifetime.signal)

try {
  ui.init()
  const renderer = await createScene(ui.arena)
  renderer.render(standby, true)
  try {
    const backendOrigin = getBackendOrigin()
    const results = createLeaderboard(backendOrigin, ui.records, lifetime.signal)
    controller = createRoundController({
      state: appState, renderer, view: ui.round, controls, results,
      startLocal: startLocalRound,
      startOnline: backendOrigin ? createOnlineMatch(backendOrigin) : undefined,
    })
    controls.bindKeyboard(controller.isActive, lifetime.signal)
    appState.set({ phase: 'ready', mode: backendOrigin ? 'online' : 'local' })
    ui.round.setStartEnabled(true)
    ui.round.announce(backendOrigin ? 'Арена готова.' : 'Доступна локальная игра с ботом.')

    import.meta.hot?.dispose(() => {
      lifetime.abort()
      controller?.dispose()
      renderer.destroy()
    })
  } catch (error) {
    ui.round.announce('Не удалось настроить игру.')
    throw error
  }
} catch (error) {
  ui.round.announce('Не удалось загрузить игру.')
  appState.set({ phase: 'error', error })
  console.error(error)
}
