import { Assets, type Texture } from 'pixi.js'
import playerRight from './assets/player-plane-right.webp'
import playerDown from './assets/player-plane-down.webp'
import playerLeft from './assets/player-plane-left.webp'
import playerUp from './assets/player-plane-up.webp'
import botRight from './assets/enemy-plane-right.webp'
import botDown from './assets/enemy-plane-down.webp'
import botLeft from './assets/enemy-plane-left.webp'
import botUp from './assets/enemy-plane-up.webp'
import paperStar from './assets/paper-star.webp?no-inline'
import type { PlaneTextures } from './plane.js'

function loadPlane(right: string, down: string, left: string, up: string): Promise<PlaneTextures> {
  return Promise.all([
    Assets.load<Texture>(right),
    Assets.load<Texture>(down),
    Assets.load<Texture>(left),
    Assets.load<Texture>(up),
  ])
}

export async function loadArenaTextures() {
  const [player, bot, star] = await Promise.all([
    loadPlane(playerRight, playerDown, playerLeft, playerUp),
    loadPlane(botRight, botDown, botLeft, botUp),
    Assets.load<Texture>(paperStar),
  ])
  return { player, bot, star }
}
