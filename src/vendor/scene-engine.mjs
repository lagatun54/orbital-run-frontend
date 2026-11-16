// Generated from lagatun54/engine-pixi-js@6799e8d33161b9b1dd8f88fde2037d8a4676b881 by scripts/vendor-scene-engine.sh.

// rendering/initEngineApplication.ts
async function initEngineApplication(app, options = {}) {
  const { renderer = "auto", ...initOptions } = options;
  if (renderer !== "auto" && renderer !== "webgl" && renderer !== "canvas") {
    throw new Error(`Unsupported engine renderer: ${renderer}`);
  }
  await app.init({
    ...initOptions,
    preference: renderer === "auto" ? ["webgl", "canvas"] : [renderer]
  });
}

// layout/screen.ts
var PORTRAIT_WIDE_ASPECT_RATIO = 2;
var LANDSCAPE_WIDE_ASPECT_RATIO = 2;
var TABLET_MIN_SHORT_EDGE = 768;
var SCREEN_PRESETS = {
  landscape: {
    width: 700,
    height: 520
  },
  landscapeWide: {
    width: 812,
    height: 375
  },
  landscapeTablet: {
    width: 1024,
    height: 768
  },
  portrait: {
    width: 420,
    height: 740
  },
  portraitWide: {
    width: 375,
    height: 812
  },
  portraitTablet: {
    width: 768,
    height: 1024
  }
};
var LAYOUT_FALLBACKS = {
  portraitWide: ["portrait"],
  portraitTablet: ["portraitWide", "portrait"],
  landscapeWide: ["landscape"],
  landscapeTablet: ["landscapeWide", "landscape"]
};
var detectOrientation = (screenWidth, screenHeight) => {
  const shortEdge = Math.min(screenWidth, screenHeight);
  const isTablet = shortEdge >= TABLET_MIN_SHORT_EDGE;
  if (screenWidth >= screenHeight) {
    if (isTablet) {
      return "landscapeTablet";
    }
    if (screenWidth / screenHeight >= LANDSCAPE_WIDE_ASPECT_RATIO) {
      return "landscapeWide";
    }
    return "landscape";
  }
  if (isTablet) {
    return "portraitTablet";
  }
  if (screenHeight / screenWidth >= PORTRAIT_WIDE_ASPECT_RATIO) {
    return "portraitWide";
  }
  return "portrait";
};
var resolveLayoutOrientation = (orientation, available) => {
  if (available[orientation] !== void 0) {
    return orientation;
  }
  for (const fallback of LAYOUT_FALLBACKS[orientation] ?? []) {
    if (available[fallback] !== void 0) {
      return fallback;
    }
  }
  return orientation;
};
var createLayoutContext = (result) => ({
  preset: SCREEN_PRESETS[result.orientation],
  screen: result.screen,
  transform: {
    scale: result.scale,
    position: result.position,
    pivot: result.pivot
  }
});
var SceneScreen = class {
  layout(container, screenWidth, screenHeight) {
    const orientation = detectOrientation(screenWidth, screenHeight);
    const preset = SCREEN_PRESETS[orientation];
    const scale = Math.min(screenWidth / preset.width, screenHeight / preset.height);
    const centerX = screenWidth / 2;
    const centerY = screenHeight / 2;
    container.pivot.set(preset.width / 2, preset.height / 2);
    container.position.set(centerX, centerY);
    container.scale.set(scale);
    return {
      orientation,
      scale,
      position: { x: centerX, y: centerY },
      pivot: { x: preset.width / 2, y: preset.height / 2 },
      screen: { width: screenWidth, height: screenHeight }
    };
  }
};

// views/sceneView.ts
import { Container } from "pixi.js";
var SceneView = class {
  constructor(name = "sceneView") {
    this.screen = new SceneScreen();
    this.objects = /* @__PURE__ */ new Map();
    this.parents = /* @__PURE__ */ new Set();
    this.initializing = false;
    this.disposed = false;
    this.container = new Container({ label: name });
    this.parents.add(this.container);
    this.container.once("destroyed", () => {
      this.disposed = true;
      this.stopAnimations();
      for (const parent of [...this.parents].reverse()) {
        if (!parent.destroyed) parent.destroy({ children: true });
      }
      this.objects.clear();
      this.parents.clear();
    });
  }
  get destroyed() {
    return this.disposed;
  }
  /** Creates an owned hierarchy node. Sibling insertion order is the drawing order. */
  addContainer(options, parent = this.container) {
    this.assertBuilding();
    this.assertParent(parent);
    const container = new Container(options);
    parent.addChild(container);
    this.parents.add(container);
    return container;
  }
  /** Returns the concrete object type, so view fields keep APIs such as setText()/redraw(). */
  addObject(object, options = {}) {
    this.assertBuilding();
    const parent = options.parent ?? this.container;
    this.assertParent(parent);
    if (this.objects.has(object.name)) {
      throw new Error(
        `SceneView "${this.container.label}": duplicate object name "${object.name}".`
      );
    }
    if (object.display.destroyed || object.display.parent) {
      throw new Error(`SceneView: object "${object.name}" must be alive and unattached.`);
    }
    if (options.layouts && parent !== this.container) {
      throw new Error(
        "SceneView: screen layouts require a root object; use local transforms for children."
      );
    }
    this.applyTransform(object, options.transform);
    object.display.label = object.name;
    parent.addChild(object.display);
    this.parents.add(object.display);
    this.objects.set(object.name, { object, layouts: options.layouts });
    return object;
  }
  getObject(name) {
    return this.objects.get(name)?.object;
  }
  /** Runs each object's async init once, in registration order. A failed view is destroyed. */
  init() {
    if (this.disposed) return Promise.reject(new Error("SceneView is destroyed."));
    if (!this.initPromise) {
      this.initializing = true;
      this.initPromise = this.initialize();
    }
    return this.initPromise;
  }
  /** Call from the host's resize handler; the root must be mounted under an untransformed stage. */
  layout(width, height) {
    this.assertAlive();
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error("SceneView: viewport dimensions must be finite positive numbers.");
    }
    this.viewport = { width, height };
    const result = this.screen.layout(this.container, width, height);
    const context = createLayoutContext(result);
    for (const { object, layouts } of this.objects.values()) {
      if (layouts) object.layout(result.orientation, context, layouts);
      else object.applyPivot(result.orientation);
    }
    return result;
  }
  /** Destroys owned displays, while shared textures stay in the asset cache. */
  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.container.visible = false;
    this.container.removeFromParent();
    this.stopAnimations();
    if (!this.initializing) this.container.destroy({ children: true });
  }
  async initialize() {
    try {
      for (const { object } of this.objects.values()) {
        await object.init();
        this.assertAlive();
        object.applyPivot();
      }
      if (this.viewport) this.layout(this.viewport.width, this.viewport.height);
    } catch (error) {
      this.destroy();
      throw error;
    } finally {
      this.initializing = false;
      if (this.disposed && !this.container.destroyed) this.container.destroy({ children: true });
    }
  }
  applyTransform(object, transform = {}) {
    const display = object.display;
    if (transform.x !== void 0) display.x = transform.x;
    if (transform.y !== void 0) display.y = transform.y;
    if (typeof transform.scale === "number") display.scale.set(transform.scale);
    else if (transform.scale) display.scale.set(transform.scale.x, transform.scale.y);
    if (transform.rotation !== void 0) display.rotation = transform.rotation;
    if (transform.alpha !== void 0) display.alpha = transform.alpha;
    if (transform.visible !== void 0) display.visible = transform.visible;
    Object.assign(object.layoutState, {
      x: display.x,
      y: display.y,
      scale: display.scale.x,
      alpha: display.alpha,
      rotation: display.rotation
    });
  }
  stopAnimations() {
    for (const { object } of this.objects.values()) object.killAnimations();
  }
  assertAlive() {
    if (this.disposed) throw new Error("SceneView is destroyed.");
  }
  assertBuilding() {
    this.assertAlive();
    if (this.initializing || this.initPromise) {
      throw new Error("SceneView: register objects and containers before init().");
    }
  }
  assertParent(parent) {
    if (!this.parents.has(parent) || parent.destroyed) {
      throw new Error("SceneView: parent must be a live container registered in this view.");
    }
  }
};

// views/anchors.ts
var SCENE_VIEW_ANCHORS = {
  "top-left": { x: 0, y: 0 },
  top: { x: 0.5, y: 0 },
  "top-right": { x: 1, y: 0 },
  left: { x: 0, y: 0.5 },
  center: { x: 0.5, y: 0.5 },
  right: { x: 1, y: 0.5 },
  "bottom-left": { x: 0, y: 1 },
  bottom: { x: 0.5, y: 1 },
  "bottom-right": { x: 1, y: 1 }
};
function resolveSceneViewAnchor(anchor) {
  const point = typeof anchor === "string" ? SCENE_VIEW_ANCHORS[anchor] : anchor;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
    throw new Error("SceneView: anchor and pivot must be a preset or fractions between 0 and 1.");
  }
  return { x: point.x, y: point.y };
}

// views/createSceneView.ts
var placementKeys = ["x", "y", "scale", "rotation"];
var DefinedSceneView = class extends SceneView {
  constructor(definition) {
    super(definition.name);
    this.layers = [];
    this.responsiveNodes = [];
    const refs = /* @__PURE__ */ Object.create(null);
    this.refs = refs;
    try {
      validateDefinition(definition);
      for (const [name, layer] of Object.entries(definition.layers)) {
        const display = this.addContainer({ label: name });
        refs[name] = display;
        const runtimeLayer = {
          display,
          viewport: layer.viewport,
          area: { x: 0, y: 0, ...layer.viewport.design }
        };
        this.layers.push(runtimeLayer);
        this.buildNodes(layer.nodes, display, refs, () => runtimeLayer.area);
      }
    } catch (error) {
      this.destroy();
      throw error;
    }
  }
  layout(width, height) {
    const result = super.layout(width, height);
    this.container.position.set(0);
    this.container.pivot.set(0);
    this.container.scale.set(1);
    for (const layer of this.layers) {
      const { display, viewport } = layer;
      const orientation = resolveLayoutOrientation(result.orientation, viewport.responsive ?? {});
      const design = viewport.responsive?.[orientation] ?? viewport.design;
      const ratioX = width / design.width;
      const ratioY = height / design.height;
      const scale = viewport.fit === "cover" ? Math.max(ratioX, ratioY) : Math.min(ratioX, ratioY);
      display.scale.set(scale);
      display.position.set(
        (width - design.width * scale) / 2,
        (height - design.height * scale) / 2
      );
      layer.area = {
        x: -display.x / scale,
        y: -display.y / scale,
        width: width / scale,
        height: height / scale
      };
    }
    for (let index = this.responsiveNodes.length - 1; index >= 0; index--) {
      const node = this.responsiveNodes[index];
      const variants = node.definition.responsive ?? {};
      const orientation = resolveLayoutOrientation(result.orientation, variants);
      const placement = {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        anchor: node.definition.anchor,
        pivot: node.definition.pivot,
        ...node.definition.transform,
        ...variants[orientation]
      };
      for (const key of node.keys) {
        if (key === "scale") {
          const scale = placement.scale;
          if (typeof scale === "number") node.display.scale.set(scale);
          else node.display.scale.set(scale.x, scale.y);
          if (node.object) node.object.layoutState.scale = node.display.scale.x;
        } else {
          node.display[key] = placement[key];
          if (node.object) node.object.layoutState[key] = node.display[key];
        }
      }
      const anchor = placement.anchor;
      const pivot = placement.pivot ?? anchor;
      if (pivot) {
        const point = resolveSceneViewAnchor(pivot);
        const bounds = node.definition.size ? { x: 0, y: 0, ...node.definition.size } : node.object?.layoutBounds ?? node.display.getLocalBounds();
        node.display.pivot.set(
          bounds.x + bounds.width * point.x,
          bounds.y + bounds.height * point.y
        );
      } else if (node.managesPivot) {
        node.display.pivot.set(0);
        node.object?.applyPivot(result.orientation);
      }
      if (anchor) {
        const point = resolveSceneViewAnchor(anchor);
        const area = node.parentArea();
        node.display.position.set(
          area.x + area.width * point.x + placement.x,
          area.y + area.height * point.y + placement.y
        );
        if (node.object) {
          node.object.layoutState.x = node.display.x;
          node.object.layoutState.y = node.display.y;
        }
      }
    }
    return { ...result, scale: 1, position: { x: 0, y: 0 }, pivot: { x: 0, y: 0 } };
  }
  buildNodes(nodes, parent, refs, parentArea) {
    for (const [name, definition] of Object.entries(nodes)) {
      const object = definition.create?.(name);
      if (object && object.name !== name) {
        if (!object.display.parent && !object.display.destroyed) {
          object.killAnimations();
          object.display.destroy({ children: true });
        }
        throw new Error(
          `SceneView: factory for "${name}" must return an object with the same name.`
        );
      }
      const display = object ? this.addObject(object, { parent, transform: definition.transform }).display : this.addContainer({ ...definition.transform, label: name }, parent);
      refs[name] = object ?? display;
      const variants = Object.values(definition.responsive ?? {});
      const keys = placementKeys.filter(
        (key) => variants.some((placement) => placement?.[key] !== void 0)
      );
      const placements = [definition, ...variants];
      const hasAnchor = placements.some((placement) => placement?.anchor !== void 0);
      const anchored = hasAnchor || placements.some((placement) => placement?.pivot !== void 0);
      if (hasAnchor) {
        for (const key of ["x", "y"]) if (!keys.includes(key)) keys.push(key);
      }
      if (keys.length || anchored)
        this.responsiveNodes.push({
          display,
          object,
          definition,
          keys,
          parentArea,
          managesPivot: anchored
        });
      if (definition.events) {
        display.eventMode = "static";
        for (const [event, handler] of Object.entries(definition.events)) {
          if (handler) display.on(event, handler);
        }
      }
      if (definition.nodes)
        this.buildNodes(definition.nodes, display, refs, () => ({
          x: 0,
          y: 0,
          width: definition.size?.width ?? 0,
          height: definition.size?.height ?? 0
        }));
    }
  }
};
function createSceneView(definition) {
  return new DefinedSceneView(definition);
}
function validateDefinition(definition) {
  const names = /* @__PURE__ */ new Set();
  const ancestors = /* @__PURE__ */ new Set();
  const register = (name) => {
    if (!name.trim() || names.has(name))
      throw new Error(`SceneView: invalid or duplicate node key "${name}".`);
    names.add(name);
  };
  const validateSize = (size) => {
    if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
      throw new Error("SceneView: design dimensions must be finite positive numbers.");
    }
  };
  const visit = (nodes, parentHasArea = true) => {
    for (const [name, node] of Object.entries(nodes)) {
      register(name);
      const placements = [node, ...Object.values(node.responsive ?? {})];
      for (const placement of placements) {
        if (placement?.anchor !== void 0) {
          resolveSceneViewAnchor(placement.anchor);
          if (!parentHasArea)
            throw new Error(`SceneView: parent of anchored node "${name}" requires size.`);
        }
        if (placement?.pivot !== void 0) resolveSceneViewAnchor(placement.pivot);
      }
      if (node.size) validateSize(node.size);
      if (ancestors.has(node)) throw new Error("SceneView: cyclic node hierarchy.");
      ancestors.add(node);
      if (node.nodes) visit(node.nodes, node.size !== void 0);
      ancestors.delete(node);
    }
  };
  for (const [name, layer] of Object.entries(definition.layers)) {
    register(name);
    if (layer.viewport.fit !== "contain" && layer.viewport.fit !== "cover") {
      throw new Error("SceneView: viewport fit must be contain or cover.");
    }
    validateSize(layer.viewport.design);
    for (const size of Object.values(layer.viewport.responsive ?? {})) if (size) validateSize(size);
    visit(layer.nodes);
  }
}
export {
  createSceneView,
  initEngineApplication
};
