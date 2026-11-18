import { Container, Filter, Sprite, UniformGroup, defaultFilterVert, type Texture } from 'pixi.js'
import { CRYSTAL_COUNT } from './constants.js'
import type { ArenaProjection, Point } from './interfaces/frame.js'
import { createPickupBursts } from './pickup-burst.js'

const starSize = 32
const spawnMS = 320
const shineIntervalMS = 840
const shineMS = 540

export function createStarPickups(texture: Texture, useShader: boolean) {
  const layer = new Container()
  const baseScale = starSize / texture.width
  const shine = useShader ? createPaperShine() : undefined
  const bursts = createPickupBursts()
  layer.addChild(bursts.layer)
  let litStar: Sprite | undefined
  let elapsed = 0
  let sizeMultiplier = 1

  const stars = Array.from({ length: CRYSTAL_COUNT }, () => {
    const sprite = new Sprite({ texture, anchor: 0.5 })
    sprite.scale.set(baseScale)
    sprite.visible = false
    layer.addChild(sprite)
    return { sprite, position: { x: 0, y: 0 }, spawned: -spawnMS }
  })

  layer.once('destroyed', () => shine?.filter.destroy())

  function setPoints(
    points: ReadonlyArray<Point>,
    { scaleX, scaleY, offsetX, offsetY }: ArenaProjection,
    reset: boolean,
    reducedMotion: boolean,
  ) {
    if (reset) bursts.clear()

    for (let index = 0; index < stars.length; index++) {
      const star = stars[index]!
      const { sprite, position } = star
      const point = points[index]
      const x = point ? point.x * scaleX + offsetX : undefined
      const y = point ? point.y * scaleY + offsetY : undefined
      if (reset) {
        star.spawned = elapsed - spawnMS
      } else if (sprite.visible && !reducedMotion && (position.x !== x || position.y !== y)) {
        bursts.play(position, index)
        star.spawned = elapsed
      }
      sprite.visible = point !== undefined
      if (x !== undefined && y !== undefined) {
        position.x = x
        position.y = y
        sprite.position.set(x, y)
      }
    }
  }

  function update(deltaMS: number, reducedMotion: boolean) {
    elapsed += deltaMS
    for (let index = 0; index < stars.length; index++) {
      const { sprite, position, spawned } = stars[index]!
      if (!sprite.visible) continue
      const phase = elapsed / 410 + index * 1.73
      const appear = reducedMotion ? 1 : Math.min((elapsed - spawned) / spawnMS, 1)
      const spring = (1 - appear) ** 2
      const pop = 1 - 0.43 * spring * Math.cos(appear * Math.PI * 2.8)
      const stretch = 0.18 * spring * Math.sin(appear * Math.PI * 3)
      const pulse = reducedMotion ? 1 : 1 + 0.035 * Math.sin(phase)
      sprite.y = position.y + (reducedMotion ? 0 : 2.4 * Math.sin(phase))
      sprite.rotation = reducedMotion ? 0 : 0.12 * Math.sin(phase * 0.8)
      sprite.scale.set(baseScale * sizeMultiplier * pulse * (pop - stretch), baseScale * sizeMultiplier * pulse * (pop + stretch))
    }

    bursts.update(deltaMS, reducedMotion)

    if (!shine) return
    const sweep = (elapsed % shineIntervalMS) / shineMS
    const candidate = stars[Math.floor(elapsed / shineIntervalMS) % stars.length]?.sprite
    const target = !reducedMotion && sweep < 1 && candidate?.visible ? candidate : undefined
    if (target !== litStar) {
      if (litStar) litStar.filters = null
      if (target) target.filters = shine.filter
      litStar = target
    }
    shine.uniforms.uSweep = sweep
  }

  return {
    layer, setPoints, update,
    setSizeMultiplier(value: number) { sizeMultiplier = value },
  }
}

function createPaperShine() {
  const group = new UniformGroup({ uSweep: { value: 0, type: 'f32' } })
  const filter = Filter.from({
    gl: {
      name: 'paper-star-shine',
      preferredFragmentPrecision: 'highp',
      vertex: defaultFilterVert,
      fragment: `
        in vec2 vTextureCoord;
        out vec4 finalColor;
        uniform sampler2D uTexture;
        uniform vec4 uInputSize;
        uniform vec4 uOutputFrame;
        uniform float uSweep;

        void main() {
          vec4 paper = texture(uTexture, vTextureCoord);
          vec2 uv = vTextureCoord * uInputSize.xy / uOutputFrame.zw;
          float diagonal = uv.x + 0.38 * uv.y;
          float center = mix(-0.21, 1.59, uSweep);
          float band = 1.0 - smoothstep(0.035, 0.21, abs(diagonal - center));
          float inkMask = smoothstep(0.42, 0.76, paper.g / max(paper.a, 0.001));
          vec3 light = vec3(1.0, 0.97, 0.82) * paper.a;
          finalColor = vec4(mix(paper.rgb, light, band * inkMask * 0.56), paper.a);
        }
      `,
    },
    resources: { paperShine: group },
    resolution: 'inherit',
  })
  return { filter, uniforms: group.uniforms }
}
