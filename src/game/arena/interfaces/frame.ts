export interface Point {
  readonly x: number
  readonly y: number
}

export interface ArenaProjection {
  scaleX: number
  scaleY: number
  offsetX: number
  offsetY: number
}

export interface ShipPose extends Point {
  readonly angle: number
}

export interface ArenaFrame {
  readonly player: ShipPose
  readonly bot: ShipPose
  readonly crystals: ReadonlyArray<Point>
  readonly pendingPickups?: ReadonlySet<number>
}

export interface ArenaRenderer {
  render(frame: ArenaFrame, reset?: boolean): void
  setRoundActive(active: boolean): void
  destroy(): void
}
