import {
  CanvasSource, CompressedSource, RendererType, Sprite, Spritesheet, Texture,
  getSupportedTextureFormats, loadKTX2onWorker, setKTXTranscoderPath,
  type Renderer, type SpritesheetData, type TextureSourceOptions,
} from 'pixi.js'
import { fetchAssetPack } from './asset-pack.js'
import type { PlaneTextures } from './arena/interfaces/textures.js'

function createCanvasSource({ width, height, resource }: TextureSourceOptions) {
  const pixels = resource?.[0]
  if (!width || !height || !(pixels instanceof Uint8Array) || pixels.length !== width * height * 4) {
    throw new Error('Invalid RGBA atlas')
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  const image = context.createImageData(width, height)
  image.data.set(pixels)
  context.putImageData(image, 0, 0)
  return new CanvasSource({ resource: canvas, resolution: 1 })
}

async function loadPackedSheets(canvasOnly: boolean) {
  const [pack, formats] = await Promise.all([
    fetchAssetPack(),
    canvasOnly ? ['rgba8unorm' as const] : getSupportedTextureFormats(),
  ])
  const jsUrl = URL.createObjectURL(pack.decoderJs)
  const wasmUrl = URL.createObjectURL(pack.decoderWasm)
  setKTXTranscoderPath({ jsUrl, wasmUrl })

  async function loadSheet(blob: Blob, data: SpritesheetData) {
    const url = URL.createObjectURL(blob)
    try {
      const options = await loadKTX2onWorker(url, formats)
      const source = canvasOnly ? createCanvasSource(options) : new CompressedSource({ ...options, resolution: 1 })
      const sheet = new Spritesheet({ texture: source, data })
      try {
        await sheet.parse()
        return sheet
      } catch (error) {
        sheet.destroy(true)
        throw error
      }
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  try {
    const [arena, ui] = await Promise.allSettled([
      loadSheet(pack.arena, pack.manifest.arena),
      loadSheet(pack.ui, pack.manifest.ui),
    ])
    if (arena.status === 'rejected') {
      if (ui.status === 'fulfilled') ui.value.destroy(true)
      throw arena.reason
    }
    if (ui.status === 'rejected') {
      arena.value.destroy(true)
      throw ui.reason
    }
    return [arena.value, ui.value] as const
  } finally {
    URL.revokeObjectURL(jsUrl)
    URL.revokeObjectURL(wasmUrl)
  }
}

export async function loadGameTextures(renderer: Renderer, artwork: Iterable<HTMLCanvasElement>) {
  const [arena, ui] = await loadPackedSheets(renderer.type === RendererType.CANVAS)

  function getTexture(sheet: Spritesheet, name: string): Texture {
    const texture = sheet.textures[name]
    if (!texture) throw new Error(`Missing atlas frame: ${name}`)
    return texture
  }

  function loadPlane(plane: 'player-plane' | 'enemy-plane'): PlaneTextures {
    return [
      getTexture(arena, `${plane}-right`),
      getTexture(arena, `${plane}-down`),
      getTexture(arena, `${plane}-left`),
      getTexture(arena, `${plane}-up`),
    ]
  }

  function getAtlasCanvas(sheet: Spritesheet): HTMLCanvasElement {
    const source = sheet.textureSource
    if (source instanceof CanvasSource) {
      return source.resource as HTMLCanvasElement
    }
    const sprite = new Sprite({ texture: new Texture({ source }), blendMode: 'none' })
    try {
      return renderer.extract.canvas({ target: sprite, resolution: 1 }) as HTMLCanvasElement
    } finally {
      sprite.destroy({ texture: true })
    }
  }

  try {
    // Read each GPU atlas once and copy its frames into the static DOM artwork.
    const arenaCanvas = getAtlasCanvas(arena)
    const uiCanvas = getAtlasCanvas(ui)
    for (const target of artwork) {
      const name = target.dataset.artwork!
      const inUi = ui.textures[name] !== undefined
      const { x, y, width, height } = getTexture(inUi ? ui : arena, name).frame
      target.width = width
      target.height = height
      target.getContext('2d')!.drawImage(inUi ? uiCanvas : arenaCanvas, x, y, width, height, 0, 0, width, height)
    }

    return {
      player: loadPlane('player-plane'),
      bot: loadPlane('enemy-plane'),
      star: getTexture(arena, 'paper-star'),
      destroy() { arena.destroy(true) },
    }
  } catch (error) {
    arena.destroy(true)
    throw error
  } finally {
    ui.destroy(true)
  }
}
