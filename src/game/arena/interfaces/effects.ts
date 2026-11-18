import type { Graphics } from 'pixi.js'

export interface InkPoint {
  x: number
  y: number
  time: number
  distance: number
  start: boolean
}

export interface BurstDrawing {
  marks: Graphics
  pieces: ReadonlyArray<{ drawing: Graphics, angle: number, x: number, y: number, size: number, turn: number }>
}
