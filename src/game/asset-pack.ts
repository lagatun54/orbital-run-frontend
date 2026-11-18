import type { SpritesheetData } from 'pixi.js'
import packUrl from '../../.generated/game.pack?url&no-inline'

export async function fetchAssetPack() {
  const response = await fetch(packUrl)
  if (!response.ok || !response.body) throw new Error(`Asset package request failed (${response.status})`)

  const unpacked = response.body.pipeThrough(new DecompressionStream('gzip'))
  const buffer = await new Response(unpacked).arrayBuffer()
  const view = new DataView(buffer)
  if (view.byteLength < 4 || view.getUint32(0) !== 0x4f524231) {
    throw new Error('Invalid asset package header')
  }

  let offset = 4
  function readSection() {
    if (offset + 4 > view.byteLength) throw new Error('Truncated asset package')
    const size = view.getUint32(offset, true)
    offset += 4
    if (size === 0 || offset + size > view.byteLength) throw new Error('Invalid asset package section')
    const section = new Uint8Array(buffer, offset, size)
    offset += size
    return section
  }

  const manifest = JSON.parse(new TextDecoder().decode(readSection())) as {
    arena: SpritesheetData
    ui: SpritesheetData
  }
  const arena = new Blob([readSection()], { type: 'image/ktx2' })
  const ui = new Blob([readSection()], { type: 'image/ktx2' })
  const decoderJs = new Blob([readSection()], { type: 'text/javascript' })
  const decoderWasm = new Blob([readSection()], { type: 'application/wasm' })
  if (offset !== view.byteLength) throw new Error('Unexpected data at end of asset package')

  return { manifest, arena, ui, decoderJs, decoderWasm }
}
