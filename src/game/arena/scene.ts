import { Application, Graphics, RendererType } from 'pixi.js'
import { createSceneView, initEngineApplication } from '../../vendor/scene-engine.mjs'
import { Plane } from './plane.js'
import { loadGameTextures } from '../textures.js'
import { createStarPickups } from './star-pickups.js'
import { ARENA_WIDTH as width, ARENA_HEIGHT as height } from './constants.js'
import type { ArenaFrame, ArenaProjection, ArenaRenderer, ShipPose } from './interfaces/frame.js'

const paper = { background: 0xfbf7eb, grid: 0xc9d6de, margin: 0xdb9d99, cell: 30 }
const menuFPS = 30
const renderResolution = () => Math.min(window.devicePixelRatio, 2)

const arena = {
  name: 'orbital-arena',
  layers: {
    field: {
      viewport: { fit: 'contain' as const, design: { width, height } },
      nodes: { wake: {}, pickups: {}, playerShip: {}, botShip: {} },
    },
  },
}

export async function createScene(host: HTMLElement, artwork: Iterable<HTMLCanvasElement>): Promise<ArenaRenderer> {
  const app = new Application()
  const view = createSceneView(arena)
  const listeners = new AbortController()
  let observer: ResizeObserver | undefined
  let destroyTextures: (() => void) | undefined

  function destroy() {
    if (listeners.signal.aborted) return
    listeners.abort()
    observer?.disconnect()
    view.destroy()
    if (app.renderer) app.destroy(true, { children: true })
    destroyTextures?.()
  }

  try {
    await initEngineApplication(app, {
      width, height, background: paper.background, antialias: true,
      renderer: 'auto', autoDensity: true, resolution: renderResolution(), autoStart: false,
    })
    const textures = await loadGameTextures(app.renderer, artwork)
    destroyTextures = textures.destroy
    const supportsMesh = app.renderer.type !== RendererType.CANVAS
    const field = new Graphics()
    app.stage.addChild(field, view.container)
    const scene = populateArena(
      view,
      new Plane(textures.player, 0x4779bc, supportsMesh),
      new Plane(textures.bot, 0xc57461, supportsMesh),
      createStarPickups(textures.star, app.renderer.type === RendererType.WEBGL),
    )
    await view.init()
    app.ticker.maxFPS = menuFPS
    app.ticker.add(({ deltaMS }) => scene.update(deltaMS))
    host.prepend(app.canvas)

    function resize() {
      const { clientWidth, clientHeight } = host
      if (!clientWidth || !clientHeight) return
      app.renderer.resize(clientWidth, clientHeight, renderResolution())
      drawGrid(field, clientWidth, clientHeight)
      scene.layout(clientWidth, clientHeight)
    }

    observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    window.addEventListener('resize', resize, { signal: listeners.signal })
    app.start()
    return {
      render: scene.render,
      setRoundActive(active) { app.ticker.maxFPS = active ? 0 : menuFPS },
      destroy,
    }
  } catch (error) {
    destroy()
    throw error
  }
}

function drawGrid(field: Graphics, width: number, height: number) {
  field.clear()
  for (let x = paper.cell; x < width; x += paper.cell) {
    field.moveTo(x, 0).lineTo(x, height)
  }
  for (let y = paper.cell; y < height; y += paper.cell) {
    field.moveTo(0, y).lineTo(width, y)
  }
  field.stroke({ width: 1, color: paper.grid })
  field.moveTo(paper.cell * 2, 0).lineTo(paper.cell * 2, height)
    .stroke({ width: 1.5, color: paper.margin })
}

function populateArena(
  view: ReturnType<typeof createSceneView<typeof arena>>,
  player: Plane,
  bot: Plane,
  pickups: ReturnType<typeof createStarPickups>,
) {
  const { refs } = view
  refs.wake.addChild(player.wakeLayer, bot.wakeLayer)
  refs.pickups.addChild(pickups.layer)
  refs.playerShip.addChild(player)
  refs.botShip.addChild(bot)

  let source: ArenaFrame | undefined
  let poses: { player: ShipPose; bot: ShipPose } | undefined
  const projection: ArenaProjection = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

  function projectPose(pose: ShipPose): ShipPose {
    const { scaleX, scaleY, offsetX, offsetY } = projection
    return {
      x: pose.x * scaleX + offsetX,
      y: pose.y * scaleY + offsetY,
      angle: Math.atan2(Math.sin(pose.angle) * scaleY, Math.cos(pose.angle) * scaleX),
    }
  }

  function render(next: ArenaFrame, reset = false) {
    source = next
    poses = { player: projectPose(next.player), bot: projectPose(next.bot) }
    if (reset) {
      player.reset(poses.player)
      bot.reset(poses.bot)
    }
    pickups.setPoints(next.crystals, projection, reset, reducedMotion.matches)
  }

  return {
    render,
    update(deltaMS: number) {
      if (!poses) return
      const reduce = reducedMotion.matches
      pickups.update(deltaMS, reduce)
      player.update(poses.player, deltaMS, reduce)
      bot.update(poses.bot, deltaMS, reduce)
    },
    layout(viewWidth: number, viewHeight: number) {
      view.layout(viewWidth, viewHeight)
      // Map match positions across the screen while keeping the artwork uniformly scaled.
      const { x, y, scale } = refs.field
      // Keep small-screen artwork readable without changing game coordinates.
      const artworkScale = Math.max(1, 42 / (52 * scale.x))
      player.scale.set(artworkScale)
      bot.scale.set(artworkScale)
      pickups.setSizeMultiplier(Math.max(1, 26 / (32 * scale.x)))
      projection.scaleX = viewWidth / (width * scale.x)
      projection.scaleY = viewHeight / (height * scale.y)
      projection.offsetX = -x / scale.x
      projection.offsetY = -y / scale.y
      if (source) render(source, true)
    },
  }
}

export const standby: ArenaFrame = {
  player: { x: 224, y: 270, angle: 0 }, bot: { x: 736, y: 270, angle: Math.PI },
  crystals: [
    { x: 155, y: 120 }, { x: 318, y: 383 }, { x: 394, y: 140 },
    { x: 487, y: 275 }, { x: 585, y: 400 }, { x: 661, y: 137 }, { x: 819, y: 362 },
  ],
}
