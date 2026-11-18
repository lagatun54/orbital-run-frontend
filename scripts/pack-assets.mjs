import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { AssetPack } from '@assetpack/core'
import config from '../.assetpack.js'

const output = '.generated'
await mkdir(output, { recursive: true })
const work = await mkdtemp(join(output, 'pack-'))

try {
  const atlases = join(work, 'atlases')
  await new AssetPack({ ...config, output: atlases, cacheLocation: join(work, 'cache') }).run()
  const transcoder = new URL('../transcoders/ktx/', import.meta.resolve('pixi.js'))

  async function readAtlas(name) {
    const json = JSON.parse(await readFile(join(atlases, `${name}.basis.json`), 'utf8'))
    if (json.meta.related_multi_packs?.length) throw new Error(`Expected one KTX2 atlas for ${name}`)
    const texture = await readFile(join(atlases, json.meta.image))
    return { data: { frames: json.frames, meta: { scale: json.meta.scale } }, texture }
  }

  const [arena, ui, decoderJs, decoderWasm] = await Promise.all([
    readAtlas('arena'),
    readAtlas('ui'),
    readFile(new URL('libktx.js', transcoder)),
    readFile(new URL('libktx.wasm', transcoder)),
  ])
  const manifest = Buffer.from(JSON.stringify({ arena: arena.data, ui: ui.data }))

  // ORB1, then five length-prefixed sections. Lengths are little-endian uint32s.
  const parts = [Buffer.from('ORB1')]
  for (const section of [manifest, arena.texture, ui.texture, decoderJs, decoderWasm]) {
    const length = Buffer.alloc(4)
    length.writeUInt32LE(section.byteLength)
    parts.push(length, section)
  }
  const packed = join(work, 'game.pack')
  await writeFile(packed, gzipSync(Buffer.concat(parts)))
  await rename(packed, join(output, 'game.pack'))
} finally {
  await rm(work, { recursive: true, force: true })
}
