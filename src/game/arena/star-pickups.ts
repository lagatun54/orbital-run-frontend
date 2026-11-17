import { Container, Filter, Sprite, UniformGroup, defaultFilterVert, type Texture } from 'pixi.js'
import { CRYSTAL_COUNT, type Point } from './model.js'
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

  const stars = Array.from({ length: CRYSTAL_COUNT }, () => {
    const sprite = new Sprite({ texture, anchor: 0.5 })
    sprite.scale.set(baseScale)
    sprite.visible = false
    layer.addChild(sprite)
    return { sprite, point: undefined as Point | undefined, spawned: -spawnMS }
  })

  layer.once('destroyed', () => shine?.filter.destroy())

  function setPoints(points: ReadonlyArray<Point>, reset: boolean, reducedMotion: boolean) {
    if (reset) bursts.clear()

    stars.forEach((star, index) => {
      const point = points[index]
      const previous = star.point
      star.point = point
      star.sprite.visible = point !== undefined
      if (point) star.sprite.position.set(point.x, point.y)
      if (reset) {
        star.spawned = elapsed - spawnMS
      } else if (previous && (previous.x !== point?.x || previous.y !== point?.y) && !reducedMotion) {
        bursts.play(previous, index)
        star.spawned = elapsed
      }
    })
  }

  function update(deltaMS: number, reducedMotion: boolean) {
    elapsed += deltaMS
    stars.forEach(({ sprite, point, spawned }, index) => {
      if (!point) return
      const phase = elapsed / 410 + index * 1.73
      const appear = reducedMotion ? 1 : Math.min((elapsed - spawned) / spawnMS, 1)
      const spring = (1 - appear) ** 2
      const pop = 1 - 0.43 * spring * Math.cos(appear * Math.PI * 2.8)
      const stretch = 0.18 * spring * Math.sin(appear * Math.PI * 3)
      const pulse = reducedMotion ? 1 : 1 + 0.035 * Math.sin(phase)
      sprite.y = point.y + (reducedMotion ? 0 : 2.4 * Math.sin(phase))
      sprite.rotation = reducedMotion ? 0 : 0.12 * Math.sin(phase * 0.8)
      sprite.scale.set(baseScale * pulse * (pop - stretch), baseScale * pulse * (pop + stretch))
    })

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

  return { layer, setPoints, update }
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
