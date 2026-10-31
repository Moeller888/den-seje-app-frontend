/**
 * PixiJS v8 scene renderer (spec 06 F2.1 layers 1–3: background layers, the
 * depth-sorted world layer and foreground layers).
 *
 * The renderer owns no game state. Every frame it reads the engine's world
 * (player scene, scroll, painter's order, positions, variants, scale) and
 * reconciles its sprites with it. Speech, UI, fade and cursor (layers 4–7)
 * are DOM layers of the app above the canvas.
 */

import type { LoadedContent } from "@adventure-engine/content";
import type { DrawItem, Engine } from "@adventure-engine/core";
import type { AtlasSpec } from "@adventure-engine/content";
import { Application, Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import type { AssetManager } from "./assets.ts";
import type { Letterbox, Size } from "./letterbox.ts";

export interface PixiRendererOptions {
  readonly host: HTMLElement;
  readonly logical: Size;
  readonly assets: AssetManager<Texture>;
  /** Draw walk areas, blockers and zones (dev overlay, spec 06 F2.3). */
  readonly showZones?: boolean;
  readonly background?: number;
  /** Current animation frame(s) of an entity (phase 4): atlas id and the frame per layer ("" = base). */
  readonly animation?: (entity: string) => { readonly atlas: string; readonly frames: Readonly<Record<string, number>> } | null;
  /** Atlas layout from the manifest. */
  readonly atlasOf?: (atlasId: string) => AtlasSpec | undefined;
  /** Texture for missing frames (dev: visible placeholder). */
  readonly placeholder?: Texture;
  onWarning?(message: string): void;
}

/** Load an image URL as a texture; rejects when the image cannot be fetched or decoded. */
export async function loadImageTexture(_id: string, url: string): Promise<Texture> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  if (img.naturalWidth === 0 || img.naturalHeight === 0) throw new Error("image has no size");
  // Rasterise once (SVG included) so that Pixi gets a canvas source.
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const g = canvas.getContext("2d");
  if (g === null) throw new Error("no 2D context to rasterise the image");
  g.drawImage(img, 0, 0);
  return Texture.from(canvas);
}

/** Dev placeholder: a clearly visible checker; production uses an invisible texture (spec 06 F8.4). */
export function placeholderTexture(dev: boolean): Texture {
  if (!dev) return Texture.EMPTY;
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const g = c.getContext("2d");
  if (g !== null) {
    g.fillStyle = "#ff00ff";
    g.fillRect(0, 0, 32, 32);
    g.fillStyle = "#000000";
    g.fillRect(0, 0, 16, 16);
    g.fillRect(16, 16, 16, 16);
  }
  return Texture.from(c);
}

const DEFAULT_SIZE = { width: 40, height: 100 };

export class PixiSceneRenderer {
  readonly app: Application;
  private readonly opts: PixiRendererOptions;
  private readonly world = new Container();
  private readonly zones = new Graphics();
  private readonly sprites = new Map<string, Sprite>();
  private readonly frames = new Map<string, Texture>();
  private readonly warned = new Set<string>();
  private sceneId: string | null = null;
  /** Signature of the last drawn frame; an unchanged frame is not drawn again. */
  private drawn = "";

  private constructor(app: Application, opts: PixiRendererOptions) {
    this.app = app;
    this.opts = opts;
    this.world.sortableChildren = true;
    app.stage.addChild(this.world);
    this.world.addChild(this.zones);
    this.zones.zIndex = Number.MAX_SAFE_INTEGER;
  }

  /** Create the renderer (WebGL preferred). Rejects when no GPU backend is available. */
  static async create(opts: PixiRendererOptions): Promise<PixiSceneRenderer> {
    const app = new Application();
    await app.init({
      width: opts.logical.width,
      height: opts.logical.height,
      background: opts.background ?? 0x101418,
      preference: "webgl",
      antialias: false,
      autoDensity: true,
      resolution: Math.max(1, Math.min(2, globalThis.devicePixelRatio ?? 1)),
    });
    app.ticker.stop();
    app.canvas.setAttribute("aria-hidden", "true");
    opts.host.appendChild(app.canvas);
    return new PixiSceneRenderer(app, opts);
  }

  /** Place and size the canvas for the letterbox (CSS pixels). */
  resize(box: Letterbox): void {
    const w = Math.max(1, Math.round(box.width));
    const h = Math.max(1, Math.round(box.height));
    this.app.renderer.resize(w, h);
    this.app.stage.scale.set(box.scale);
    const style = this.app.canvas.style;
    style.position = "absolute";
    style.left = `${box.offsetX}px`;
    style.top = `${box.offsetY}px`;
    style.width = `${w}px`;
    style.height = `${h}px`;
    this.drawn = "";
  }

  /** Reconcile sprites with the engine's world and draw one frame. */
  render(engine: Engine): void {
    const world = engine.world;
    const player = world.playerId;
    const sceneId = player === null ? null : (world.actors.get(player)?.scene ?? null);
    if (sceneId !== this.sceneId) this.switchScene(engine.content, engine, sceneId);
    if (sceneId === null) {
      this.draw("none");
      return;
    }
    this.world.x = -world.scrollX;
    const seen = new Set<string>();
    engine.drawOrder(sceneId).forEach((item, order) => {
      const key = `${item.kind}:${item.id}`;
      for (const k of this.place(engine, sceneId, item, key, order)) seen.add(k);
    });
    const parts: Array<string | number> = [sceneId, this.world.x];
    for (const [key, sprite] of this.sprites) {
      if (!seen.has(key)) {
        sprite.destroy();
        this.sprites.delete(key);
        continue;
      }
      parts.push(key, sprite.zIndex, sprite.x, sprite.y, sprite.scale.x, sprite.scale.y, sprite.texture.uid);
    }
    this.draw(parts.join("|"));
  }

  /**
   * Draw only when the picture changed. Redrawing an unchanged WebGL canvas
   * costs a full GPU frame (and a readback with software GL) for nothing.
   */
  private draw(signature: string): void {
    if (signature === this.drawn) return;
    this.drawn = signature;
    this.app.render();
  }

  destroy(): void {
    for (const t of this.frames.values()) t.destroy(false);
    this.frames.clear();
    this.app.destroy(true, { children: true });
  }

  private switchScene(content: LoadedContent, engine: Engine, sceneId: string | null): void {
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
    this.sceneId = sceneId;
    this.zones.clear();
    if (sceneId === null || this.opts.showZones !== true) return;
    const def = engine.space(sceneId).def;
    const poly = (points: ReadonlyArray<readonly [number, number]>, color: number): void => {
      this.zones.poly(points.flatMap((p) => [p[0], p[1]])).stroke({ width: 2, color, alpha: 0.9 });
    };
    for (const p of def.walkable ?? []) poly(p, 0x33cc66);
    for (const p of def.blockers ?? []) poly(p, 0xcc3333);
    for (const z of def.objectZones ?? []) poly(z.polygon, 0xffcc00);
    for (const z of def.actorZones ?? []) poly(z.polygon, 0x33aaff);
    for (const z of def.triggerZones ?? []) poly(z.polygon, 0xaa66ff);
    for (const p of content.pkg.portals ?? []) if (p.from === sceneId && p.polygon !== undefined) poly(p.polygon, 0xffffff);
  }

  /** Texture of one atlas frame (cached); a frame outside the atlas is a placeholder plus one warning. */
  private frameTexture(atlasId: string, base: Texture, spec: AtlasSpec, frame: number): Texture {
    const key = `${atlasId}#${frame}`;
    const hit = this.frames.get(key);
    if (hit !== undefined) return hit;
    if (!(Number.isInteger(frame) && frame >= 0 && frame < spec.frames)) {
      if (!this.warned.has(key)) {
        this.warned.add(key);
        this.opts.onWarning?.(`frame ${frame} is outside atlas "${atlasId}" (${spec.frames} frames); placeholder used`);
      }
      return this.opts.placeholder ?? Texture.EMPTY;
    }
    const cols = spec.columns ?? spec.frames;
    const t = new Texture({ source: base.source, frame: new Rectangle((frame % cols) * spec.frameWidth, Math.floor(frame / cols) * spec.frameHeight, spec.frameWidth, spec.frameHeight) });
    this.frames.set(key, t);
    return t;
  }

  /** Free the frame textures of an atlas (cache eviction); the base texture belongs to the asset manager. */
  releaseAtlas(atlasId: string): void {
    for (const [key, t] of [...this.frames]) {
      if (!key.startsWith(`${atlasId}#`)) continue;
      t.destroy(false);
      this.frames.delete(key);
    }
    this.drawn = "";
  }

  private sprite(key: string, texture: Texture, order: number): Sprite {
    let sprite = this.sprites.get(key);
    if (sprite === undefined) {
      sprite = new Sprite(texture);
      sprite.label = key;
      this.sprites.set(key, sprite);
      this.world.addChild(sprite);
    } else if (sprite.texture !== texture) sprite.texture = texture;
    sprite.zIndex = order;
    return sprite;
  }

  /** Create or update the sprite(s) of one draw item; returns the keys drawn (empty: nothing to draw). */
  private place(engine: Engine, sceneId: string, item: DrawItem, key: string, order: number): string[] {
    const content = engine.content;
    const world = engine.world;
    let assetId: string | undefined;
    let x = 0;
    let y = 0;
    let anchorFeet = true;
    let height: number | null = null;
    let flip = false;
    let fallbackSize = DEFAULT_SIZE;
    if (item.kind === "layer") {
      const layer = engine.space(sceneId).def.layers?.find((l) => l.id === item.id);
      const variant = world.scenes.get(sceneId)?.variant ?? "default";
      assetId = layer?.assets?.[variant] ?? layer?.assets?.["default"];
      anchorFeet = false;
      const space = engine.space(sceneId);
      fallbackSize = { width: space.width, height: space.height };
    } else if (item.kind === "actor") {
      const st = world.actors.get(item.id);
      const def = content.actors.get(item.id);
      if (st?.pos === null || st?.pos === undefined || def === undefined) return [];
      assetId = def.variants[st.variant]?.sprite;
      [x, y] = st.pos;
      height = engine.actorScale(item.id).effectiveHeightPx;
      flip = st.facing.includes("left");
      fallbackSize = def.hitBox ?? DEFAULT_SIZE;
    } else {
      const st = world.objects.get(item.id);
      const pos = st === undefined ? null : engine.space(sceneId).spot(st.spot);
      if (st === undefined || pos === null) return [];
      assetId = content.objects.get(item.id)?.variants[st.variant]?.sprite;
      [x, y] = pos;
    }
    // An active animation (phase 4) replaces the static sprite: atlas frames are drawn per direction, so no flip.
    const anim = item.kind === "layer" ? null : (this.opts.animation?.(item.id) ?? null);
    const spec = anim === null ? undefined : this.opts.atlasOf?.(anim.atlas);
    const atlas = anim === null || spec === undefined || this.opts.assets.status(anim.atlas) !== "loaded" ? undefined : this.opts.assets.get(anim.atlas);
    if (anim !== null && spec !== undefined && atlas !== undefined) {
      const scale = height !== null ? height / spec.frameHeight : 1;
      const [ax, ay] = spec.anchor ?? [spec.frameWidth / 2, spec.frameHeight];
      const keys: string[] = [];
      const put = (k: string, frame: number, dx: number, dy: number, z: number): void => {
        const sp = this.sprite(k, this.frameTexture(anim.atlas, atlas, spec, frame), z);
        sp.anchor.set(ax / spec.frameWidth, ay / spec.frameHeight);
        sp.position.set(x + dx * scale, y + dy * scale);
        sp.scale.set(scale, scale);
        keys.push(k);
      };
      put(key, anim.frames[""] ?? 0, 0, 0, order);
      for (const [layer, frame] of Object.entries(anim.frames)) {
        if (layer === "") continue;
        const off = spec.layers?.[layer] ?? { dx: 0, dy: 0 };
        put(`${key}/${layer}`, frame, off.dx, off.dy, order + 0.5);
      }
      return keys;
    }
    if (assetId === undefined) return [];
    const texture = this.opts.assets.get(assetId);
    if (texture === undefined) return [];
    const sprite = this.sprite(key, texture, order);
    sprite.anchor.set(anchorFeet ? 0.5 : 0, anchorFeet ? 1 : 0);
    sprite.position.set(x, y);
    // A placeholder is stretched to the entity's logical size so that it stays recognisable.
    const natural = this.opts.assets.status(assetId) === "loaded" && texture.width > 1 && texture.height > 1;
    if (!natural) {
      sprite.width = fallbackSize.width;
      sprite.height = fallbackSize.height;
    } else if (height !== null) {
      sprite.scale.set((height / texture.height) * (flip ? -1 : 1), height / texture.height);
    } else sprite.scale.set(flip ? -1 : 1, 1);
    return [key];
  }
}
