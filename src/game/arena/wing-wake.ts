import { CanvasSource, Container, Mesh, MeshGeometry, Texture } from 'pixi.js'

const inkLifeMS = 1_050
const sampleIntervalMS = 20
const maxSamples = Math.ceil(inkLifeMS / sampleIntervalMS) + 3
const curveSteps = 5
const maxSections = maxSamples * (curveSteps + 1)
const wingTips = [{ x: -17, y: -15 }, { x: -17, y: 15 }]

interface InkPoint {
  x: number
  y: number
  time: number
  distance: number
  start: boolean
}

let inkTexture: Texture | undefined

export function createWingWake(color: number) {
  const layer = new Container()
  const texture = inkTexture ??= createInkTexture()
  const ribbons = wingTips.map(tip => {
    const ribbon = createRibbon(texture, color)
    layer.addChild(ribbon.mesh)
    return { tip, ribbon }
  })
  let time = 0

  return {
    layer,
    clear() {
      time = 0
      for (const { ribbon } of ribbons) ribbon.clear()
    },
    update(wings: Container, speed: number, deltaMS: number) {
      time += deltaMS
      for (const { tip, ribbon } of ribbons) {
        ribbon.update(time, speed >= 24 ? layer.toLocal(tip, wings) : undefined)
      }
    },
  }
}

function createInkTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 32
  const context = canvas.getContext('2d')!
  const pixels = context.createImageData(canvas.width, canvas.height)
  for (let y = 0; y < canvas.height; y++) {
    const across = y / (canvas.height - 1) * 2 - 1
    const core = Math.max(0, 1 - Math.abs(across + 0.09)) ** 1.4
    const edge = Math.max(0, 1 - Math.abs(across - 0.53) / 0.23) * 0.13
    for (let x = 0; x < canvas.width; x++) {
      const age = x / (canvas.width - 1)
      const offset = (y * canvas.width + x) * 4
      pixels.data.set([255, 255, 255, (core + edge) * (1 - age) ** 1.45 * 238], offset)
    }
  }
  context.putImageData(pixels, 0, 0)
  return new Texture({ source: new CanvasSource({ resource: canvas }) })
}

function createRibbon(texture: Texture, color: number) {
  const positions = new Float32Array(maxSections * 4)
  const uvs = new Float32Array(positions.length)
  const indices = new Uint32Array((maxSections - 1) * 6)
  const geometry = new MeshGeometry({ positions, uvs, indices })
  const mesh = new Mesh({ geometry, texture, tint: color, visible: false })
  const history: InkPoint[] = []
  let tip: InkPoint | undefined
  let drawing = false

  function writeSection(section: number, x: number, y: number, dx: number, dy: number,
    age: number, distance: number, connect: boolean) {
    const length = Math.hypot(dx, dy) || 1
    const pressure = 1 + 0.11 * Math.sin(distance / 8) + 0.05 * Math.sin(distance / 3)
    const halfWidth = 1.8 * pressure * (1 - 0.42 * age)
    const nx = -dy / length * halfWidth
    const ny = dx / length * halfWidth
    const offset = section * 4
    positions[offset] = x + nx
    positions[offset + 1] = y + ny
    positions[offset + 2] = x - nx
    positions[offset + 3] = y - ny
    uvs[offset] = age
    uvs[offset + 1] = 0
    uvs[offset + 2] = age
    uvs[offset + 3] = 1

    if (!connect) return
    const vertex = section * 2
    const index = (section - 1) * 6
    indices[index] = vertex - 2
    indices[index + 1] = vertex - 1
    indices[index + 2] = vertex
    indices[index + 3] = vertex
    indices[index + 4] = vertex - 1
    indices[index + 5] = vertex + 1
  }

  return {
    mesh,
    clear() {
      history.length = 0
      tip = undefined
      drawing = false
      mesh.visible = false
    },
    update(now: number, point?: { x: number; y: number }) {
      if (point) {
        const last = history.at(-1)
        const distance = last ? Math.hypot(point.x - last.x, point.y - last.y) : 0
        if (!drawing || distance > 64) {
          if (tip) history.push(tip)
          history.push({ ...point, time: now, distance: 0, start: true })
          tip = undefined
        } else if (distance > 0.6 && last) {
          tip = { ...point, time: now, distance: last.distance + distance, start: false }
          if (now - last.time >= sampleIntervalMS) {
            history.push(tip)
            tip = undefined
          }
        }
      } else if (tip) {
        history.push(tip)
        tip = undefined
      }
      drawing = point !== undefined

      while (history[0] && (now - history[0].time > inkLifeMS || history.length >= maxSamples)) {
        history.shift()
      }

      const count = history.length + Number(tip !== undefined)
      mesh.visible = count > 1
      if (!mesh.visible) return
      indices.fill(0)

      let sections = 0
      for (let i = 0; i < count; i++) {
        const sample = history[i] ?? tip!
        const next = history[i + 1] ?? (i + 1 === history.length ? tip : undefined)
        const previous = sample.start ? sample : history[i - 1] ?? sample
        const following = next && !next.start ? next : sample
        const startsCurve = previous === sample
        if (startsCurve && following === sample) continue
        const inX = sample.x - previous.x
        const inY = sample.y - previous.y
        const outX = following.x - sample.x
        const outY = following.y - sample.y

        // Neighbouring quadratic curves share a midpoint and a tangent.
        for (let step = startsCurve ? 0 : 1; step <= curveSteps; step++) {
          const t = step / curveSteps
          const before = (1 - t) ** 2 / 2
          const after = t ** 2 / 2
          const x = sample.x - inX * before + outX * after
          const y = sample.y - inY * before + outY * after
          let dx = inX * (1 - t) + outX * t
          let dy = inY * (1 - t) + outY * t
          if (Math.hypot(dx, dy) < 0.0001) {
            const useIncoming = following === sample || (!startsCurve && t < 0.5)
            dx = useIncoming ? inX : outX
            dy = useIncoming ? inY : outY
          }
          const time = sample.time - (sample.time - previous.time) * before + (following.time - sample.time) * after
          const distance = sample.distance - (sample.distance - previous.distance) * before +
            (following.distance - sample.distance) * after
          writeSection(sections++, x, y, dx, dy, Math.min(1, (now - time) / inkLifeMS), distance, step > 0)
        }
      }
      mesh.visible = sections > 0
      if (!mesh.visible) return
      const tail = (sections - 1) * 4
      for (let i = sections * 4; i < positions.length; i += 2) {
        positions[i] = positions[tail]!
        positions[i + 1] = positions[tail + 1]!
      }
      geometry.getBuffer('aPosition').update()
      geometry.getBuffer('aUV').update()
      geometry.getIndex().update()
    },
  }
}
