import { Container, Graphics } from 'pixi.js'
import type { BurstDrawing } from './interfaces/effects.js'
import { CRYSTAL_COUNT } from './constants.js'
import type { Point } from './interfaces/frame.js'

const durationMS = 540
const ink = 0x936026
const shards = [
  { angle: -2.73, reach: 34, size: 0.95, color: 0xf6c362, turn: 2.8 },
  { angle: -1.91, reach: 25, size: 0.72, color: 0xffe5a2, turn: -3.4 },
  { angle: -1.07, reach: 39, size: 1.06, color: 0xf4cd74, turn: 3.7 },
  { angle: -0.16, reach: 29, size: 0.78, color: 0xeeb454, turn: -3.0 },
  { angle: 0.73, reach: 35, size: 1.05, color: 0xffdb80, turn: 3.3 },
  { angle: 1.80, reach: 27, size: 0.8, color: 0xf2c367, turn: -2.9 },
  { angle: 2.60, reach: 41, size: 0.93, color: 0xffdf8d, turn: -3.9 },
]

export function createPickupBursts() {
  const layer = new Container()
  let next = 0
  const pool = Array.from({ length: CRYSTAL_COUNT * 2 }, () => {
    const root = new Container({ visible: false })
    const marks = new Graphics()
      .moveTo(-12, -3).quadraticCurveTo(-11, -11, -3, -12)
      .moveTo(12, 0).quadraticCurveTo(11, 10, 4, 12)
      .moveTo(-12, 7).quadraticCurveTo(-10, 11, -7, 13)
      .stroke({ color: 0xc48733, width: 1.6, cap: 'round' })
      .moveTo(5, -15).lineTo(6, -19)
      .moveTo(16, 6).lineTo(20, 8)
      .moveTo(-17, 0).lineTo(-21, 1)
      .stroke({ color: ink, width: 1.5, cap: 'round' })
    const pieces = shards.map(({ angle, reach, size, color, turn }) => {
      const drawing = new Graphics()
        .poly([-4, -2, 1, -3.5, 4.5, 0.5, 1, 3, -2.5, 2])
        .fill(color)
        .stroke({ color: ink, width: 0.9, join: 'round' })
        .moveTo(1, -2.6).lineTo(0, 1).lineTo(3.4, 0.6)
        .stroke({ color: 0xfff2c9, width: 1, cap: 'round' })
      return { drawing, angle, x: Math.cos(angle) * reach, y: Math.sin(angle) * reach, size, turn }
    })
    root.addChild(marks, ...pieces.map(({ drawing }) => drawing))
    layer.addChild(root)
    return { root, marks, pieces, age: 0 }
  })

  return {
    layer,
    play(point: Point, index: number) {
      const burst = pool[next]!
      next = (next + 1) % pool.length
      burst.age = 0
      burst.root.position.set(point.x, point.y)
      burst.root.rotation = index * 1.1
      burst.root.visible = true
      animateBurst(burst, 0)
    },
    clear() {
      for (const { root } of pool) root.visible = false
    },
    update(deltaMS: number, reducedMotion: boolean) {
      for (const burst of pool) {
        if (!burst.root.visible) continue
        burst.age += deltaMS
        const progress = burst.age / durationMS
        burst.root.visible = !reducedMotion && progress < 1
        if (burst.root.visible) animateBurst(burst, progress)
      }
    },
  }
}

function animateBurst({ marks, pieces }: BurstDrawing, progress: number) {
  const spread = 1 - (1 - progress) ** 3
  const scatter = 0.19 + spread * 0.81
  const tail = Math.min(1, (1 - progress) / 0.45)
  marks.scale.set(0.7 + 1.1 * spread)
  marks.alpha = Math.max(0, 1 - progress * 2) ** 1.5

  for (const { drawing, angle, x, y, size, turn } of pieces) {
    const flutter = 0.38 + 0.62 * Math.abs(Math.cos(angle + progress * 13))
    const scale = size * tail
    drawing.position.set(x * scatter, y * scatter + 9 * progress ** 2)
    drawing.rotation = angle + turn * progress
    drawing.scale.set(scale * flutter, scale)
    drawing.alpha = 0.5 + 0.5 * tail
  }
}
