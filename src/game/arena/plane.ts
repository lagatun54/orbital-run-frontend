import { Container, Sprite } from 'pixi.js'
import type { ShipPose } from './interfaces/frame.js'
import type { PlaneTextures } from './interfaces/textures.js'
import { createWingWake } from './wing-wake.js'

const quarterTurn = Math.PI / 2
const planeSize = 52
const headingTolerance = Math.PI / 360
const flightCycleMS = 680

export class Plane extends Container {
  private readonly wings = new Container()
  private readonly sprite: Sprite
  private readonly wake: ReturnType<typeof createWingWake>
  private frameIndex = 0
  private targetAngle = 0
  private turn = { start: 0, arc: 0, elapsed: 0, duration: 0, startBank: 0 }
  private bank = 0
  private flightAmount = 0
  private flightPhase = 0

  constructor(private readonly textures: PlaneTextures, wakeColor: number, useWake: boolean) {
    super()
    this.sprite = new Sprite({ texture: this.textures[0], anchor: 0.5 })
    this.sprite.setSize(planeSize)
    this.wings.addChild(this.sprite)
    this.addChild(this.wings)
    this.wake = createWingWake(wakeColor, useWake)
  }

  get wakeLayer() {
    return this.wake.layer
  }

  reset(pose: ShipPose) {
    this.wake.clear()
    this.position.set(pose.x, pose.y)
    this.targetAngle = pose.angle
    this.turn.elapsed = this.turn.duration
    this.flightAmount = 0
    this.flightPhase = 0
    this.setHeading(pose.angle, 0)
    this.wings.y = 0
    this.wings.rotation = 0
    this.wings.scale.set(1)
  }

  update(pose: ShipPose, deltaMS: number, reducedMotion: boolean) {
    const { x, y } = this
    if (reducedMotion) {
      this.reset(pose)
      return
    }
    const blend = 1 - Math.exp(-deltaMS / 35)
    this.x += (pose.x - x) * blend
    this.y += (pose.y - y) * blend
    this.updateTurn(pose.angle, deltaMS)
    const speed = Math.hypot(this.x - x, this.y - y) * 1000 / Math.max(deltaMS, 1)
    this.updateFlight(speed, deltaMS)
    this.wake.update(this.wings, speed, deltaMS)
  }

  private updateFlight(speed: number, deltaMS: number) {
    const target = Math.min(1, Math.max(0, (speed - 20) / 100))
    const responseMS = target > this.flightAmount ? 120 : 165
    this.flightAmount += (target - this.flightAmount) * (1 - Math.exp(-deltaMS / responseMS))
    if (this.flightAmount < 0.005) this.flightAmount = 0
    if (this.flightAmount > 0) {
      this.flightPhase = (this.flightPhase + deltaMS / flightCycleMS) % 1
    }

    const phase = this.flightPhase * Math.PI * 2
    const amount = this.flightAmount ** 2 * (3 - 2 * this.flightAmount)
    const sway = Math.sin(phase) * amount
    const scale = 1 + Math.cos(phase) * amount * 0.06
    this.wings.y = 2.5 * sway
    this.wings.rotation = 0.085 * sway
    this.wings.scale.set(scale, scale * (1 - this.bank))
  }

  private updateTurn(angle: number, deltaMS: number) {
    if (Math.abs(shortestTurn(angle - this.targetAngle)) > headingTolerance) {
      const arc = shortestTurn(angle - this.rotation)
      this.targetAngle = angle
      this.turn = {
        start: this.rotation,
        arc,
        elapsed: 0,
        duration: 95 + 80 * Math.abs(arc) / Math.PI,
        startBank: this.bank,
      }
    }

    const turn = this.turn
    if (turn.elapsed >= turn.duration) return
    turn.elapsed = Math.min(turn.elapsed + deltaMS, turn.duration)
    const progress = turn.elapsed / turn.duration
    const eased = 1 - (1 - progress) ** 3
    const bank = (1 - eased) * turn.startBank +
      Math.sin(Math.PI * progress) * 0.16 * Math.min(Math.abs(turn.arc) / quarterTurn, 1)
    this.setHeading(turn.start + turn.arc * eased, bank)
  }

  private setHeading(angle: number, bank: number) {
    this.rotation = angle
    this.bank = bank
    const turn = Math.round(angle / quarterTurn)
    const index = (turn % this.textures.length + this.textures.length) % this.textures.length
    if (index === this.frameIndex) return
    this.frameIndex = index
    this.sprite.texture = this.textures[index]!
    this.sprite.rotation = -index * quarterTurn
  }
}

function shortestTurn(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}
