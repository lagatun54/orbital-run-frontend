// Bit flags shared with the online match protocol.
export const Direction = {
  Up: 1,
  Down: 2,
  Left: 4,
  Right: 8,
} as const

export function directionVector(direction: number) {
  return {
    x: Number(Boolean(direction & Direction.Right)) - Number(Boolean(direction & Direction.Left)),
    y: Number(Boolean(direction & Direction.Down)) - Number(Boolean(direction & Direction.Up)),
  }
}
