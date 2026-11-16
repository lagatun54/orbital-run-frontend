import { Application, Graphics, GraphicsContext } from 'pixi.js'
import { createSceneView, initEngineApplication } from '../../vendor/scene-engine.mjs'
import {
  ARENA_WIDTH as width, ARENA_HEIGHT as height, CRYSTAL_COUNT,
  type ArenaFrame, type ArenaRenderer, type ShipPose,
} from './model.js'

const paper = { background: 0xfbf7eb, grid: 0xc9d6de, margin: 0xdb9d99, cell: 30 }

const arena = {
  name: 'orbital-arena',
  layers: {
    field: {
      viewport: { fit: 'contain' as const, design: { width, height } },
      nodes: { background: {}, pickups: {}, playerShip: {}, botShip: {} },
    },
  },
}

export async function createScene(
  host: HTMLElement,
): Promise<ArenaRenderer & { destroy(): void }> {
  const app = new Application()
  const view = createSceneView(arena)
  try {
    await initEngineApplication(app, {
      width, height, background: paper.background, antialias: true,
      renderer: 'auto', autoDensity: true, resolution: devicePixelRatio,
    })
    const render = populateArena(app, view)
    await view.init()
    app.stage.addChild(view.container)
    host.prepend(app.canvas)

    function resize() {
      const { clientWidth, clientHeight } = host
      if (!clientWidth || !clientHeight) return
      app.renderer.resize(clientWidth, clientHeight, window.devicePixelRatio)
      view.layout(clientWidth, clientHeight)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    window.addEventListener('resize', resize)
    return {
      render,
      destroy() {
        observer.disconnect()
        window.removeEventListener('resize', resize)
        view.destroy()
        app.destroy(true, { children: true })
      },
    }
  } catch (error) {
    view.destroy()
    if (app.renderer) app.destroy(true, { children: true })
    throw error
  }
}

function populateArena(
  app: Application,
  { refs }: ReturnType<typeof createSceneView<typeof arena>>,
) {
  const field = new Graphics()
  field.rect(0, 0, width, height).fill(paper.background)
  for (let x = paper.cell; x < width; x += paper.cell) {
    field.moveTo(x, 0).lineTo(x, height)
  }
  for (let y = paper.cell; y < height; y += paper.cell) {
    field.moveTo(0, y).lineTo(width, y)
  }
  field.stroke({ width: 1, color: paper.grid })
  field.moveTo(paper.cell * 2, 0).lineTo(paper.cell * 2, height)
    .stroke({ width: 1.5, color: paper.margin })
  field.rect(0, 0, width, height).stroke({ width: 2, color: paper.grid, alignment: 1 })
  refs.background.addChild(field)

  const gem = new GraphicsContext()
    .poly([0, -14, 11, 0, 0, 14, -11, 0]).fill(0xf8ba64)
    .poly([0, -14, 0, 3, -11, 0]).fill(0xffe4a0)
    .poly([0, 3, 11, 0, 0, 14]).fill(0xc57645)
    .poly([0, -14, 11, 0, 0, 14, -11, 0]).stroke({ color: 0x8a4b24, width: 1.5, join: 'round' })
  const crystals = Array.from({ length: CRYSTAL_COUNT }, () => new Graphics(gem))
  const player = rocket(0x50b79c, 0x21564f)
  const bot = rocket(0xe78070, 0x783a34)
  refs.pickups.addChild(...crystals)
  refs.playerShip.addChild(player)
  refs.botShip.addChild(bot)

  let frame: ArenaFrame | undefined
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  app.ticker.add(({ deltaMS }) => {
    if (!frame) return
    const blend = reducedMotion.matches ? 1 : 1 - Math.exp(-deltaMS / 35)
    placeShip(player, frame.player, blend)
    placeShip(bot, frame.bot, blend)
  })

  return function render(next: ArenaFrame, reset = false) {
    frame = next
    if (reset) {
      placeShip(player, next.player, 1)
      placeShip(bot, next.bot, 1)
    }
    crystals.forEach((crystal, i) => {
      const point = next.crystals[i]
      crystal.visible = point !== undefined
      if (point) crystal.position.set(point.x, point.y)
    })
  }
}

function rocket(accent: number, ink: number) {
  const outline = { color: ink, width: 2, join: 'round' as const }
  return new Graphics()
    .poly([-6, -7, -19, -15, -17, -5, -9, -3]).fill(accent).stroke(outline)
    .poly([-6, 7, -19, 15, -17, 5, -9, 3]).fill(accent).stroke(outline)
    .roundRect(-23, -4, 11, 8, 2).fill(accent).stroke(outline)
    .moveTo(-17, -6).quadraticCurveTo(-5, -12, 8, -9)
    .quadraticCurveTo(17, -7, 24, 0)
    .quadraticCurveTo(17, 7, 8, 9)
    .quadraticCurveTo(-5, 12, -17, 6).closePath()
    .fill(0xfffcf2).stroke(outline)
    .moveTo(12, -8).quadraticCurveTo(19, -6, 24, 0)
    .quadraticCurveTo(19, 6, 12, 8)
    .quadraticCurveTo(16, 0, 12, -8).closePath()
    .fill(accent).stroke(outline)
    .circle(2, 0, 4.6).fill(accent).stroke({ color: ink, width: 1.6 })
    .circle(3, -1.3, 1.3).fill(0xfffcf2)
}

function placeShip(ship: Graphics, state: ShipPose, blend: number) {
  ship.x += (state.x - ship.x) * blend
  ship.y += (state.y - ship.y) * blend
  ship.rotation = state.angle
}

export const standby: ArenaFrame = {
  player: { x: 224, y: 270, angle: 0 }, bot: { x: 736, y: 270, angle: Math.PI },
  crystals: [
    { x: 155, y: 120 }, { x: 318, y: 383 }, { x: 394, y: 140 },
    { x: 487, y: 275 }, { x: 585, y: 400 }, { x: 661, y: 137 }, { x: 819, y: 362 },
  ],
}
