import type { Application, ApplicationOptions, Container } from 'pixi.js'

// The subset of the upstream API used by the arena: layers with plain containers.
interface ArenaViewDefinition {
  name: string
  layers: Record<string, {
    viewport: { fit: 'contain' | 'cover'; design: { width: number; height: number } }
    nodes: Record<string, Record<string, never>>
  }>
}

type NodeKeys<T extends ArenaViewDefinition> = {
  [Layer in keyof T['layers']]: keyof T['layers'][Layer]['nodes']
}[keyof T['layers']]

interface SceneView<T extends ArenaViewDefinition> {
  readonly container: Container
  readonly refs: Record<keyof T['layers'] | NodeKeys<T>, Container>
  init(): Promise<void>
  layout(width: number, height: number): unknown
  destroy(): void
}

export function createSceneView<const T extends ArenaViewDefinition>(definition: T): SceneView<T>
export function initEngineApplication(
  app: Application,
  options?: Omit<Partial<ApplicationOptions>, 'preference' | 'webgpu'> & { renderer?: 'auto' | 'webgl' | 'canvas' },
): Promise<void>
