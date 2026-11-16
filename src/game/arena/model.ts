export const ARENA_WIDTH = 960
export const ARENA_HEIGHT = 540
export const CRYSTAL_COUNT = 7

export interface Point {
  readonly x: number
  readonly y: number
}

export interface ShipPose extends Point {
  readonly angle: number
}

export interface ArenaFrame {
  readonly player: ShipPose
  readonly bot: ShipPose
  readonly crystals: ReadonlyArray<Point>
}

export interface ArenaRenderer {
  render(frame: ArenaFrame, reset?: boolean): void
}
