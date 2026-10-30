/**
 * Engine facade: lifecycle (spec 01 A1), event catalogue (A4), headless
 * interaction subset (spec 04 D3) and observability (A5).
 *
 * Phase 1 scope: no renderer, no navigation, no persistence. Walking, scene
 * transitions and presentation are command contracts answered by an adapter.
 */

import type { Facing, LoadedContent, NodeDef, UseKind, Value } from "@adventure-engine/content";
import { interiorPoint, type PathResult, type Vec2 } from "@adventure-engine/geometry";
import { AmbientTracker } from "./ambient.ts";
import type { Command, CommandReply, PresentationAdapter } from "./commands.ts";
import {
  ENGINE_VERSION,
  SAVE_FORMAT,
  SAVE_FORMAT_VERSION,
  contentHash,
  parseSave,
  saveChecksum,
  type SaveData,
  type SaveError,
  type SaveWarning,
} from "./save.ts";
import { canonicalJson } from "./sha256.ts";
import { EngineError, EngineErrorCode, RuntimeCode, type RuntimeCodeValue, type RuntimeWarning } from "./errors.ts";
import { ModalLocks } from "./modal.ts";
import { Rng } from "./rng.ts";
import { Navigator } from "./navigator.ts";
import { queryPoint, type CursorResult } from "./query.ts";
import { Runtime, type ActiveRunView, type RunInfo, type RunResult, type RuntimeHost, type TransitionState } from "./runtime.ts";
import { Spaces, actorScale, drawOrder, type DrawItem, type ScaleInfo, type SceneSpace } from "./space.ts";
import { Scheduler } from "./scheduler.ts";
import { ContextFrame, Globals } from "./scope.ts";
import { TextService } from "./text.ts";
import { Tracer, roundTime, type TraceEvent } from "./trace.ts";
import { WorldState, facingOr, type WorldChange } from "./world.ts";

export interface EngineOptions {
  readonly seed: string;
  readonly adapter: PresentationAdapter;
  /** Dev build: enables the watchdog (spec 01 A7.2). Default false. */
  readonly devMode?: boolean;
  /** Watchdog limit in simulated ms. Default 60 000. */
  readonly watchdogMs?: number;
  /** Record a trace (disable for bulk statistics). Default true. */
  readonly trace?: boolean;
  /** Initial text language (default `game.defaultLanguage`). */
  readonly language?: string;
  /**
   * Wall clock for save timestamps (ISO-8601 UTC). Core never reads real time
   * itself; without this option timestamps are derived from simulated time.
   */
  readonly wallClock?: () => string;
}

/** Why saving is not possible right now (spec 05 E3: only in an idle state). */
export type SaveBlocker = "modal" | "transition" | "running";

export type SaveOutcome =
  | { readonly ok: true; readonly data: SaveData; readonly json: string }
  | { readonly ok: false; readonly reason: "not-idle"; readonly blockers: readonly SaveBlocker[] };

export type LoadOutcome =
  | { readonly ok: true; readonly warnings: readonly SaveWarning[] }
  | { readonly ok: false; readonly error: SaveError; readonly warnings: readonly SaveWarning[] };

export type ClickTarget = { readonly objectZone: string } | { readonly actorZone: string } | { readonly portal: string };

/**
 * Devtools actions (phase 6). Each runs as a synthetic run of ordinary nodes,
 * so the runtime's own rules (validation of the target, scene change, dialog
 * start, use logic) apply exactly as in the game.
 */
export type DevAction =
  | { readonly kind: "move_actor"; readonly actor: string; readonly scene: string; readonly spot?: string }
  | { readonly kind: "player_set"; readonly actor: string }
  | { readonly kind: "interact"; readonly object: string }
  | { readonly kind: "talk"; readonly target: string }
  | { readonly kind: "use_item"; readonly item: string; readonly target: string; readonly use: UseKind };

/** Where the pointer is: over the scene (scene coordinates) or over the inventory panel (spec 04 D2). */
export type Pointer = { readonly kind: "scene"; readonly point: Vec2 } | { readonly kind: "inventory"; readonly item: string | null };

/** The player's inventory as the panel shows it (spec 04 D4). */
export interface InventoryView {
  /** All items in insertion order. */
  readonly items: readonly string[];
  /** Index of the first visible slot, clamped to [0, max(0, items − slots)]. */
  readonly offset: number;
  readonly slots: number;
  readonly visible: readonly string[];
  readonly selected: string | null;
  readonly canScrollBack: boolean;
  readonly canScrollForward: boolean;
}

export const DEFAULT_INVENTORY_SLOTS = 5;

/** Warnings the presentation layer may report into the engine's warning log. */
export type PresentationWarningCode =
  | typeof RuntimeCode.AssetLoad
  | typeof RuntimeCode.I18nEmpty
  | typeof RuntimeCode.AudioLoad
  | typeof RuntimeCode.AudioLocked
  | typeof RuntimeCode.AudioUnavailable
  | typeof RuntimeCode.CutsceneLang
  | typeof RuntimeCode.CutsceneFailed
  | typeof RuntimeCode.AnimMissing;

export interface EventRecord {
  readonly t: number;
  readonly runId: string;
  readonly action: string;
  readonly receiver: string;
  /** Context of the event ($spot, $from, $to, …). */
  readonly ctx: Readonly<Record<string, Value>>;
}

/** Why the engine is not idle (spec 10: no pending locks, replies, runs or movement). */
export interface IdleReport {
  readonly idle: boolean;
  readonly runs: number;
  readonly pendingCommands: number;
  readonly moving: number;
  readonly modalLocks: number;
  readonly transitions: number;
}

export interface RunRecord {
  readonly runId: string;
  readonly receiver: string | null;
  readonly entry: string | null;
  readonly action: string | null;
  readonly result: RunResult;
}

export const GAME_RECEIVER = "$game";

export class Engine {
  readonly content: LoadedContent;
  readonly sched = new Scheduler();
  readonly tracer: Tracer;
  readonly modal: ModalLocks;
  readonly rng: Rng;
  readonly warnings: RuntimeWarning[] = [];
  readonly events: EventRecord[] = [];
  readonly finishedRuns: RunRecord[] = [];
  readonly globalWrites: string[] = [];
  readonly worldChanges: WorldChange[] = [];
  private world_: WorldState;
  private globals_: Globals;
  private readonly runtime: Runtime;
  private readonly spaces: Spaces;
  private readonly nav: Navigator;
  readonly text: TextService;
  private readonly adapter: PresentationAdapter;
  /** Running loop sounds, saved as `ambient` (phase 5). */
  readonly ambient: AmbientTracker;
  private readonly wallClock: () => string;
  private readonly devMode: boolean;
  private createdAt = "";
  private playBaseMs = 0;
  private sessionStartMs = 0;
  private contentHash_: string | null = null;
  private nextSynthetic = 1;
  private selected: string | null = null;
  private pointer_: Pointer | null = null;
  private inventoryOffset = 0;

  constructor(content: LoadedContent, options: EngineOptions) {
    this.content = content;
    this.adapter = options.adapter;
    this.ambient = new AmbientTracker(content);
    this.devMode = options.devMode ?? false;
    this.wallClock = options.wallClock ?? (() => isoFromSimulatedMs(this.sched.now));
    this.tracer = new Tracer(() => this.sched.now, options.trace ?? true);
    this.rng = Rng.fromSeed(options.seed);
    this.text = new TextService(content, {
      ...(options.language !== undefined ? { language: options.language } : {}),
      dev: options.devMode ?? false,
      warn: (message) => this.warn(RuntimeCode.I18nEmpty, message, null, null),
    });
    this.modal = new ModalLocks((event, lock, count) =>
      this.tracer.emit(`modal.${event}`, { handle: lock.handle, reason: lock.reason, owner: lock.owner, count }),
    );
    this.world_ = this.freshWorld();
    this.world_.language = this.text.language;
    this.globals_ = new Globals(content.pkg.game.globals ?? {});
    this.spaces = new Spaces(content);
    this.nav = new Navigator({
      content,
      sched: this.sched,
      tracer: this.tracer,
      spaces: this.spaces,
      world: () => this.world_,
      emitZoneEvent: (actor, _scene, zone, action) => {
        this.runtime.emitZoneEvent(actor, zone.id, zone.entry, action);
      },
    });
    const host: RuntimeHost = {
      content,
      sched: this.sched,
      modal: this.modal,
      tracer: this.tracer,
      adapter: options.adapter,
      rng: this.rng,
      devMode: options.devMode ?? false,
      watchdogMs: options.watchdogMs ?? 60000,
      world: this.world_,
      globals: this.globals_,
      warn: (code, message, runId, nodeId) => this.warn(code, message, runId, nodeId),
      onGlobalWrite: (name) => {
        this.globalWrites.push(name);
        this.runtime.noteActivity();
      },
      onRunEnd: (run, result) => {
        this.finishedRuns.push({ runId: run.id, receiver: run.receiver, entry: run.entry, action: run.action, result });
      },
      onEvent: (runId, action, receiver, ctx) => {
        this.events.push({ t: roundTime(this.sched.now), runId, action, receiver, ctx });
      },
      onQuit: () => this.backToTitle("quit"),
      nav: this.nav,
      ambient: this.ambient,
    };
    // World and globals are replaced on new game; expose them through live getters.
    Object.defineProperties(host, {
      world: { get: () => this.world_ },
      globals: { get: () => this.globals_ },
    });
    this.runtime = new Runtime(host);
  }

  get world(): WorldState {
    return this.world_;
  }

  get globals(): Globals {
    return this.globals_;
  }

  get now(): number {
    return this.sched.now;
  }

  get executions(): ReadonlyMap<string, number> {
    return this.runtime.executions;
  }

  get trace(): readonly TraceEvent[] {
    return this.tracer.events;
  }

  private freshWorld(): WorldState {
    return new WorldState(this.content, (change) => {
      this.worldChanges.push(change);
      this.tracer.emit("world", { change });
      this.runtime.noteActivity();
      this.reconcileInventory();
    });
  }

  /** After a world change: a selected item that left the player's inventory is deselected; the scroll is re-clamped (spec 04 D4). */
  private reconcileInventory(): void {
    const items = this.playerInventory();
    if (this.selected !== null && !items.includes(this.selected)) {
      this.selected = null;
      this.tracer.emit("select", { item: null, reason: "removed" });
    }
    if (this.pointer_?.kind === "inventory" && this.pointer_.item !== null && !items.includes(this.pointer_.item)) {
      this.pointer_ = { kind: "inventory", item: null };
    }
    this.inventoryOffset = clamp(this.inventoryOffset, 0, Math.max(0, items.length - this.inventorySlots));
  }

  private playerInventory(): readonly string[] {
    const player = this.world_.playerId;
    return (player === null ? undefined : this.world_.actors.get(player)?.inventory) ?? [];
  }

  /** Record a warning raised by the presentation layer (asset failures, missing texts). */
  reportWarning(code: PresentationWarningCode, message: string): void {
    this.warn(code, message, null, null);
  }

  private warn(code: RuntimeCodeValue, message: string, runId: string | null, nodeId: string | null): void {
    this.warnings.push({ t: roundTime(this.sched.now), code, message, runId, nodeId });
    this.tracer.emit("warning", { code, runId, nodeId, message });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle (spec 01 A1)
  // ---------------------------------------------------------------------------

  /** Build a fresh world and enter the player's scene; then `game.start` after the fade-in. */
  newGame(): void {
    this.runtime.cancelAll("new-game");
    this.nav.reset();
    this.world_ = this.freshWorld();
    this.globals_ = new Globals(this.content.pkg.game.globals ?? {});
    this.world_.language = this.text.language;
    this.selected = null;
    this.pointer_ = null;
    this.inventoryOffset = 0;
    this.adapter.onReset?.();
    this.ambient.reset();
    this.createdAt = this.wallClock();
    this.playBaseMs = 0;
    this.sessionStartMs = this.sched.now;
    this.tracer.emit("game.new", {});
    const player = this.world_.playerId;
    const scene = player === null ? null : (this.world_.actors.get(player)?.scene ?? null);
    if (player === null || scene === null) throw new EngineError(EngineErrorCode.NoPlayer, "newGame needs a player actor placed in a scene");
    this.event(scene, "scene.enter", { $from: null });
    // Zones the player already stands in are entered after scene.enter (spec 03 C6.4).
    this.nav.enteredScene(player);
    this.sched.settle();
    this.runtime.issueEngineCommand(
      (b) => ({ ...b, type: "SceneFade", direction: "in", ms: 500 }),
      () => {
        this.event(GAME_RECEIVER, "game.start", {});
      },
    );
    this.sched.settle();
  }

  // ---------------------------------------------------------------------------
  // Save / load (spec 05, phase 5)
  // ---------------------------------------------------------------------------

  /** Reasons that block saving now (empty: idle, spec 05 E3.1). Background branches do not block. */
  saveBlockers(): SaveBlocker[] {
    const out: SaveBlocker[] = [];
    if (this.modal.isModal) out.push("modal");
    if (this.runtime.activeTransitions().length > 0) out.push("transition");
    if (this.runtime.foregroundRunCount() > 0) out.push("running");
    return out;
  }

  /** Number of finished player scene transitions since the engine was created (autosave trigger). */
  get completedTransitions(): number {
    return this.runtime.completedTransitions;
  }

  canSave(): boolean {
    return this.saveBlockers().length === 0;
  }

  /** Accumulated active play time in simulated ms. */
  get playTimeMs(): number {
    return Math.max(0, Math.round(this.playBaseMs + this.sched.now - this.sessionStartMs));
  }

  /**
   * Save (spec 05 E3.4): only when idle; first `game.save` runs, then the
   * snapshot is taken when that run has ended. `done` is called exactly once,
   * synchronously when the logic finishes at once.
   */
  requestSave(done: (outcome: SaveOutcome) => void): void {
    const blockers = this.saveBlockers();
    if (blockers.length > 0) {
      this.tracer.emit("save.rejected", { blockers });
      done({ ok: false, reason: "not-idle", blockers });
      return;
    }
    this.event(GAME_RECEIVER, "game.save", {}, () => {
      const data = this.snapshot();
      this.tracer.emit("save", { checksum: data.checksum });
      done({ ok: true, data, json: canonicalJson(data) });
    });
  }

  /** The current state as `engine.save/1` (spec 05 E2). */
  snapshot(): SaveData {
    const w = this.world_;
    const space = (scene: string | null): SceneSpace | null => (scene === null ? null : (this.spaces.get(scene) ?? null));
    const player = w.playerId as string;
    const body: Omit<SaveData, "checksum"> = {
      format: SAVE_FORMAT,
      formatVersion: SAVE_FORMAT_VERSION,
      engineVersion: ENGINE_VERSION,
      content: { id: this.content.pkg.game.id, version: this.content.pkg.game.version, hash: (this.contentHash_ ??= contentHash(this.content)) },
      createdAt: this.createdAt,
      savedAt: this.wallClock(),
      playTimeMs: this.playTimeMs,
      language: w.language,
      playerId: player,
      rng: this.rng.serialize(),
      actors: [...w.actors.values()].map((a) => ({
        id: a.id,
        scene: a.scene,
        pos: a.scene === null || a.pos === null ? null : { x: a.pos[0], y: a.pos[1] },
        facing: a.scene === null ? null : a.facing,
        variant: a.variant,
        dialogStack: [...a.dialogStack],
        inventory: [...a.inventory],
      })),
      objects: [...w.objects.values()].map((o) => {
        const p = o.container.kind === "scene" ? (space(o.container.id)?.spot(o.spot) ?? null) : null;
        return { id: o.id, container: o.container, pos: p === null ? null : { x: p[0], y: p[1] }, facing: null, variant: o.variant, nameKey: o.nameKey };
      }),
      scenes: [...w.scenes.values()].map((s) => ({ id: s.id, variant: s.variant })),
      portals: [...w.portals.values()].map((p) => ({ id: p.id, locked: p.locked })),
      globals: Object.fromEntries(this.globals_.entries().sort((a, b) => (a[0] < b[0] ? -1 : 1))),
      ambient: { scene: w.actors.get(player)?.scene ?? null, loops: this.ambient.loops.map((l) => ({ ...l })) },
    };
    return { ...body, checksum: saveChecksum(body) };
  }

  /**
   * Load (spec 05 E4): validate, then build a fresh world, apply the save, show
   * the player's scene (no scene.exit / scene.enter, no zone events), restart
   * the ambient loops and finally send `game.load`. Repairs are reported as
   * W-SAVE-REPAIRED warnings; a rejected save leaves the current game untouched.
   */
  load(raw: string): LoadOutcome {
    const parsed = parseSave(raw, this.content, { allowChecksumMismatch: this.devMode });
    for (const w of parsed.warnings) this.warn(RuntimeCode.SaveRepaired, `${w.kind}: ${w.message}`, null, null);
    if (!parsed.ok) {
      this.tracer.emit("load.rejected", { error: parsed.error.kind, code: parsed.error.code });
      return parsed;
    }
    const d = parsed.data;
    this.runtime.cancelAll("load");
    this.nav.reset();
    this.adapter.onReset?.();
    this.world_ = this.freshWorld();
    this.globals_ = new Globals({ ...(this.content.pkg.game.globals ?? {}), ...d.globals });
    this.rng.restore(d.rng);
    this.applySave(d);
    this.text.setLanguage(d.language);
    this.selected = null;
    this.pointer_ = null;
    this.inventoryOffset = 0;
    this.createdAt = d.createdAt;
    this.playBaseMs = d.playTimeMs;
    this.sessionStartMs = this.sched.now;
    this.ambient.restore(d.ambient.loops);
    this.tracer.emit("game.load", { content: d.content.version, warnings: parsed.warnings.length });
    const player = this.world_.playerId as string;
    this.nav.restored(player);
    for (const a of this.world_.actors.values()) if (a.id !== player && a.scene !== null) this.nav.restored(a.id);
    for (const l of d.ambient.loops) {
      this.runtime.issueEngineCommand((b) => ({ ...b, type: "PlaySound", entity: l.entity, sound: l.sound, times: "loop", volume: l.volume }), null);
    }
    this.runtime.issueEngineCommand(
      (b) => ({ ...b, type: "SceneFade", direction: "in", ms: 500 }),
      () => {
        this.event(GAME_RECEIVER, "game.load", {});
      },
    );
    this.sched.settle();
    return { ok: true, warnings: parsed.warnings };
  }

  private applySave(d: SaveData): void {
    const w = this.world_;
    w.playerId = d.playerId;
    w.language = d.language;
    const spotAt = (scene: string, pos: { x: number; y: number } | null): string | null => {
      if (pos === null) return null;
      const spots = this.content.scenes.get(scene)?.spots ?? {};
      return Object.keys(spots).find((k) => spots[k]?.x === pos.x && spots[k]?.y === pos.y) ?? null;
    };
    for (const a of d.actors) {
      const st = w.actors.get(a.id);
      if (st === undefined) continue;
      st.scene = a.scene;
      st.variant = a.variant;
      st.inventory.length = 0;
      st.dialogStack.length = 0;
      st.dialogStack.push(...a.dialogStack);
      if (a.scene === null) {
        st.pos = null;
        st.spot = null;
        continue;
      }
      // Actors in a scene without a position stand on the scene's default spot (spec 05 E4).
      const fallback = this.content.scenes.get(a.scene)?.defaultSpot ?? null;
      const spot = a.pos === null ? fallback : spotAt(a.scene, a.pos);
      const p = a.pos ?? (fallback === null ? null : this.space(a.scene).spot(fallback));
      st.pos = p === null ? null : "x" in p ? [p.x, p.y] : p;
      st.spot = spot;
      st.facing = facingOr(a.facing ?? undefined);
    }
    for (const o of d.objects) {
      const st = w.objects.get(o.id);
      if (st === undefined) continue;
      st.container = o.container;
      st.variant = o.variant;
      st.nameKey = o.nameKey;
      st.spot = o.container.kind === "scene" ? (spotAt(o.container.id, o.pos) ?? (o.pos === null ? st.spot : null)) : null;
    }
    // Inventories in saved order; the validated data already agrees with the object containers.
    for (const a of d.actors) w.actors.get(a.id)?.inventory.push(...a.inventory);
    for (const s of d.scenes) {
      const st = w.scenes.get(s.id);
      if (st !== undefined) st.variant = s.variant;
    }
    for (const p of d.portals) {
      const st = w.portals.get(p.id);
      if (st !== undefined) st.locked = p.locked;
    }
  }

  /** Cancel everything and return to the title screen (spec 02 B6.2). */
  backToTitle(reason = "title"): void {
    this.runtime.cancelAll(reason);
    this.adapter.onReset?.();
    this.tracer.emit("game.title", { reason });
  }

  /** Cancel all active runs, releasing their modal locks (used by load/new game/title). */
  cancelAllRuns(reason: string): void {
    this.runtime.cancelAll(reason);
  }

  // ---------------------------------------------------------------------------
  // Runs and events
  // ---------------------------------------------------------------------------

  /** Deliver an event to a receiver's entry (spec 01 A4). */
  event(receiver: string, action: string, ctx: Readonly<Record<string, Value | null>> = {}, onEnd: (r: RunResult) => void = noop): RunInfo {
    const info = this.runtime.emitEvent(receiver, action, ctx, null, onEnd);
    this.sched.settle();
    return info;
  }

  /** Run an entry directly (graph harness / devtools). Processes everything due at the current time. */
  run(entryRef: string, ctx: Readonly<Record<string, Value | null>> = {}, onEnd: (r: RunResult) => void = noop): RunInfo {
    const info = this.runtime.runEntry(entryRef, ContextFrame.root(ctx), null, null, onEnd);
    this.sched.settle();
    return info;
  }

  /**
   * An animation signal (spec 06 F3, 01 A4): the `signal` event with `$signal`
   * to `entity`'s logic. Not awaited by the animation.
   */
  signal(entity: string, name: string): RunInfo {
    this.tracer.emit("signal", { entity, name });
    return this.event(entity, "signal", { $signal: name });
  }

  /** Switch the text language; it is also the world's language (cutscene variants, saves). */
  setLanguage(language: string): void {
    this.text.setLanguage(language);
    this.world_.language = language;
  }

  reply(cmdId: string, reply: CommandReply): boolean {
    return this.runtime.reply(cmdId, reply);
  }

  pendingCommands(): Command[] {
    return this.runtime.pendingCommands();
  }

  activeRunCount(): number {
    return this.runtime.activeRunCount();
  }

  advance(ms: number): void {
    this.sched.advance(ms);
  }

  advanceTicks(n: number): void {
    this.sched.advanceTicks(n);
  }

  /** Process all work and zero-duration completions at the current time. */
  settle(): void {
    this.sched.settle();
  }

  // ---------------------------------------------------------------------------
  // Devtools / harness helpers
  // ---------------------------------------------------------------------------

  setGlobal(name: string, value: Value): void {
    this.globals_.set(name, value);
    this.globalWrites.push(name);
    this.tracer.emit("global.set", { runId: null, nodeId: null, name, value });
  }

  /** Devtools: forget a global variable (it reads as `false` again). */
  deleteGlobal(name: string): boolean {
    const had = this.globals_.delete(name);
    if (had) this.tracer.emit("global.delete", { name });
    return had;
  }

  /** Devtools: the active runs and their active nodes. */
  activeRuns(): ActiveRunView[] {
    return this.runtime.activeRuns();
  }

  /** Devtools: perform an action through a synthetic run (see `DevAction`). */
  devAction(action: DevAction): RunInfo {
    const player = this.world_.playerId;
    const node = (p: string): NodeDef => {
      const id = `${p}.do`;
      switch (action.kind) {
        case "move_actor":
          return { id, type: "move_actor", actor: action.actor, scene: action.scene, ...(action.spot !== undefined ? { spot: action.spot } : {}) };
        case "player_set":
          return { id, type: "player_set", actor: action.actor };
        case "interact":
          return { id, type: "interact", object: action.object };
        case "talk":
          if (player === null) throw new EngineError(EngineErrorCode.NoPlayer, "talk needs a player");
          return { id, type: "talk", actor: player, target: action.target };
        case "use_item":
          return { id, type: "use_item", item: action.item, target: action.target, kind: action.use };
      }
    };
    const prefix = `$dev${this.nextSynthetic++}`;
    const nodes: NodeDef[] = [{ id: `${prefix}.entry`, type: "entry", name: prefix, next: [`${prefix}.do`] }, node(prefix)];
    this.runtime.addSyntheticNodes(nodes);
    this.tracer.emit("dev.action", { action });
    const info = this.runtime.runEntry(`${prefix}.entry`, ContextFrame.root({ $action: "dev" }), null, null, noop);
    this.sched.settle();
    return info;
  }

  pushDialog(actor: string, entryRef: string): void {
    if (!this.content.entries.has(entryRef)) throw new EngineError(EngineErrorCode.UnknownEntry, `unknown entry "${entryRef}"`);
    if (!this.world_.pushDialog(actor, entryRef)) throw new EngineError(EngineErrorCode.BadArgument, `unknown actor "${actor}"`);
  }

  // ---------------------------------------------------------------------------
  // Interaction subset (spec 04 D3): clicks on object zones and actor zones
  // ---------------------------------------------------------------------------

  /**
   * Click a zone in the player's current scene. Returns the run, or null when
   * input is modal-locked (the click is ignored, spec 04 D3/D4).
   */
  click(target: ClickTarget): RunInfo | null {
    const { player, sceneId } = this.playerScene("click");
    if (this.modal.isModal) {
      this.tracer.emit("input.ignored", { reason: "modal", target });
      return null;
    }
    if (this.selected !== null) return this.clickWithItem(this.selected, target, player, sceneId);
    if ("portal" in target) return this.clickPortal(target.portal, player, sceneId);
    const scene = this.content.scenes.get(sceneId);
    const prefix = `$ui${this.nextSynthetic++}`;
    const entryId = `${prefix}.entry`;
    const nodes: NodeDef[] = [];
    let reactOnFalse = false;
    if ("objectZone" in target) {
      const zone = scene?.objectZones?.find((z) => z.entity === target.objectZone);
      if (zone === undefined) throw new EngineError(EngineErrorCode.BadArgument, `no object zone for "${target.objectZone}" in scene "${sceneId}"`);
      nodes.push(
        { id: entryId, type: "entry", name: prefix, modal: true, next: [`${prefix}.interact`] },
        { id: `${prefix}.interact`, type: "interact", object: zone.entity },
      );
      reactOnFalse = true;
    } else {
      const zone = scene?.actorZones?.find((z) => z.actor === target.actorZone);
      if (zone === undefined) throw new EngineError(EngineErrorCode.BadArgument, `no actor zone for "${target.actorZone}" in scene "${sceneId}"`);
      const talkId = `${prefix}.talk`;
      const talk: NodeDef = { id: talkId, type: "talk", actor: player, target: zone.actor };
      if (zone.talkSpot !== undefined) {
        nodes.push(
          { id: entryId, type: "entry", name: prefix, modal: true, next: [`${prefix}.walk`] },
          { id: `${prefix}.walk`, type: "walk_to", actor: player, spot: zone.talkSpot, scene: sceneId, next: [talkId] },
          talk,
        );
      } else nodes.push({ id: entryId, type: "entry", name: prefix, modal: true, next: [talkId] }, talk);
    }
    this.runtime.addSyntheticNodes(nodes);
    this.tracer.emit("input.click", { target });
    const info = this.runtime.runEntry(entryId, ContextFrame.root({ $action: "click" }), null, null, (r) => {
      if (r === false && reactOnFalse) {
        this.runtime.issueEngineCommand((b) => ({ ...b, type: "React", actor: player, kind: "cannot" }), null);
      }
    });
    this.sched.settle();
    return info;
  }

  private playerScene(what: string): { player: string; sceneId: string } {
    const player = this.world_.playerId;
    const sceneId = player === null ? null : (this.world_.actors.get(player)?.scene ?? null);
    if (player === null || sceneId === null) throw new EngineError(EngineErrorCode.NoPlayer, `${what} needs a player in a scene`);
    return { player, sceneId };
  }

  /** Start a synthetic interaction run (spec 04 D3) from runtime-only nodes. */
  private uiRun(nodes: (prefix: string) => NodeDef[], target: unknown, onEnd: (r: RunResult, run: RunInfo) => void): RunInfo {
    const prefix = `$ui${this.nextSynthetic++}`;
    const list = nodes(prefix);
    this.runtime.addSyntheticNodes(list);
    this.tracer.emit("input.click", { target });
    const info = this.runtime.runEntry((list[0] as NodeDef).id, ContextFrame.root({ $action: "click" }), null, null, onEnd);
    this.sched.settle();
    return info;
  }

  /** Issue the fire-and-forget "cannot" reaction; a line from `ui.cannotTextKeys` is picked with the seeded rng. */
  private issueReact(actor: string): void {
    const keys = this.content.pkg.game.ui?.cannotTextKeys ?? [];
    const textKey = keys.length === 0 ? undefined : keys[this.rng.int(keys.length)];
    this.runtime.issueEngineCommand((b) => ({ ...b, type: "React", actor, kind: "cannot", ...(textKey !== undefined ? { textKey } : {}) }), null);
  }

  private react(actor: string): void {
    this.issueReact(actor);
    this.sched.settle();
  }

  /** `ui.reactWhenNothingHappens` (spec 04 D5, default true). */
  private get reactWhenNothingHappens(): boolean {
    return this.content.pkg.game.ui?.reactWhenNothingHappens ?? true;
  }

  /**
   * Use the selected item on a target (spec 04 D3/D5): a modal synthetic run with
   * `use_item`. "cannot" follows a `false` result, or a `true` result in which
   * nothing happened when `ui.reactWhenNothingHappens` is on.
   */
  private useOn(item: string, target: string, kind: "object" | "actor" | "inventory", player: string): RunInfo {
    return this.uiRun(
      (p) => [
        { id: `${p}.entry`, type: "entry", name: p, modal: true, next: [`${p}.use`] },
        { id: `${p}.use`, type: "use_item", item, target, kind },
      ],
      { use: item, on: target, kind },
      (r, run) => {
        if (r === false || (r === true && !run.activity && this.reactWhenNothingHappens)) this.issueReact(player);
      },
    );
  }

  /** Logical click with a selected item: zones become use targets; anything else is "use without target". */
  private clickWithItem(item: string, target: ClickTarget, player: string, sceneId: string): RunInfo | null {
    const scene = this.content.scenes.get(sceneId);
    this.selected = null;
    this.tracer.emit("select", { item: null, reason: "used" });
    if ("objectZone" in target && scene?.objectZones?.some((z) => z.entity === target.objectZone) === true) {
      return this.useOn(item, target.objectZone, this.world_.actors.has(target.objectZone) ? "actor" : "object", player);
    }
    if ("actorZone" in target && scene?.actorZones?.some((z) => z.actor === target.actorZone) === true) {
      return this.useOn(item, target.actorZone, "actor", player);
    }
    if (!("portal" in target)) throw new EngineError(EngineErrorCode.BadArgument, `no zone for ${JSON.stringify(target)} in scene "${sceneId}"`);
    this.tracer.emit("input.click", { target, mode: "use", item });
    this.react(player);
    return null;
  }

  private clickPortal(portalId: string, player: string, sceneId: string): RunInfo | null {
    const def = this.content.portals.get(portalId);
    if (def === undefined || def.from !== sceneId) throw new EngineError(EngineErrorCode.BadArgument, `no portal "${portalId}" in scene "${sceneId}"`);
    if (this.world_.portals.get(portalId)?.locked === true) {
      // Locked: "cannot" without asking the portal's logic (spec 03 C8).
      this.tracer.emit("input.click", { target: { portal: portalId }, locked: true });
      this.react(player);
      return null;
    }
    return this.uiRun(
      (p) => [
        { id: `${p}.entry`, type: "entry", name: p, modal: true, next: [`${p}.portal`] },
        { id: `${p}.portal`, type: "portal_use", portal: portalId, actor: player },
      ],
      { portal: portalId },
      noop,
    );
  }

  // ---------------------------------------------------------------------------
  // World query, hover and point clicks (spec 04 D1–D3)
  // ---------------------------------------------------------------------------

  /** Convert viewport coordinates to scene coordinates using the current scroll. */
  screenToScene(p: Vec2): Vec2 {
    return [p[0] + this.world_.scrollX, p[1]];
  }

  /** What lies under a scene point in the player's scene (busy while modal). */
  query(point: Vec2): CursorResult {
    const { sceneId } = this.playerScene("query");
    return queryPoint({
      content: this.content,
      world: this.world_,
      space: this.space(sceneId),
      point,
      selectedItem: this.selected,
      modal: this.modal.isModal,
    });
  }

  /** Hover a scene point; the cursor is re-evaluated at this point until the pointer moves. */
  hover(point: Vec2): CursorResult {
    this.pointer_ = { kind: "scene", point };
    return this.query(point);
  }

  /** The pointer is over the inventory panel, optionally over one of its items (spec 04 D2: the panel wins over the scene). */
  hoverInventory(item: string | null): CursorResult {
    if (item !== null) this.requireInventoryItem(item);
    this.pointer_ = { kind: "inventory", item };
    return this.cursor;
  }

  /** The pointer left the game area. */
  pointerLeave(): void {
    this.pointer_ = null;
  }

  get pointer(): Pointer | null {
    return this.pointer_;
  }

  /** Cursor at the pointer with the current state ("idle" before any pointer movement). */
  get cursor(): CursorResult {
    if (this.modal.isModal) return { mode: "busy" };
    const p = this.pointer_;
    if (p === null) return { mode: "idle" };
    return p.kind === "scene" ? this.query(p.point) : this.inventoryCursor(p.item);
  }

  private inventoryCursor(item: string | null): CursorResult {
    const tooltipKey = item === null ? null : (this.world_.objects.get(item)?.nameKey ?? null);
    if (this.selected === null) return item === null ? { mode: "idle" } : { mode: "idle", tooltipKey };
    if (item === null || item === this.selected) return { mode: "use", item: this.selected, target: null, targetKind: null, tooltipKey: null };
    return { mode: "use", item: this.selected, target: item, targetKind: "inventory", tooltipKey };
  }

  /** A scene point inside a zone or portal polygon (used for logical targets). */
  targetPoint(target: ClickTarget | { readonly triggerZone: string }): Vec2 {
    const { sceneId } = this.playerScene("targetPoint");
    const def = this.space(sceneId).def;
    const poly =
      "portal" in target
        ? this.content.portals.get(target.portal)?.polygon
        : "objectZone" in target
          ? def.objectZones?.find((z) => z.entity === target.objectZone)?.polygon
          : "actorZone" in target
            ? def.actorZones?.find((z) => z.actor === target.actorZone)?.polygon
            : def.triggerZones?.find((z) => z.id === target.triggerZone)?.polygon;
    if (poly === undefined) throw new EngineError(EngineErrorCode.BadArgument, `no polygon for ${JSON.stringify(target)} in scene "${sceneId}"`);
    return interiorPoint(poly);
  }

  /** Click a scene point: dispatch on the hover result (spec 04 D3). Null if ignored or nothing ran. */
  clickAt(point: Vec2): RunInfo | null {
    const { player } = this.playerScene("clickAt");
    // A click happens where the pointer is.
    this.pointer_ = { kind: "scene", point };
    const hit = this.query(point);
    switch (hit.mode) {
      case "busy":
        this.tracer.emit("input.ignored", { reason: "modal", point });
        return null;
      case "interact":
        return this.click({ objectZone: hit.target });
      case "talk":
        return this.click({ actorZone: hit.target });
      case "portal":
      case "portal_locked":
        return this.click({ portal: hit.target });
      case "walk": {
        // Free walk: no logic event; a new walk replaces the previous one (spec 04 D3).
        this.tracer.emit("input.click", { point, mode: "walk" });
        if (!this.nav.walk(player, point, null, noop)) this.react(player);
        this.sched.settle();
        return null;
      }
      case "use": {
        const item = hit.item;
        this.selected = null;
        this.tracer.emit("select", { item: null, reason: "used" });
        if (hit.target === null) {
          this.tracer.emit("input.click", { point, mode: "use", item });
          this.react(player);
          return null;
        }
        return this.useOn(item, hit.target, hit.targetKind === "actor" ? "actor" : "object", player);
      }
      case "idle":
        this.tracer.emit("input.click", { point, mode: "idle" });
        this.react(player);
        return null;
    }
  }

  private requireInventoryItem(itemId: string): string {
    const { player } = this.playerScene("inventory");
    if (!(this.world_.actors.get(player)?.inventory.includes(itemId) ?? false)) {
      throw new EngineError(EngineErrorCode.BadArgument, `"${itemId}" is not in the player's inventory`);
    }
    return player;
  }

  /** Select an item of the player's inventory; selecting it again clears the selection. */
  selectItem(itemId: string): void {
    this.requireInventoryItem(itemId);
    this.selected = this.selected === itemId ? null : itemId;
    this.tracer.emit("select", { item: this.selected });
  }

  clearSelection(): void {
    this.selected = null;
  }

  get selectedItem(): string | null {
    return this.selected;
  }

  /**
   * Click an item in the inventory panel (spec 04 D4): nothing selected → select;
   * the selected item → deselect; another item → combine (`use.inventory` to the
   * selected item's logic with `$target` = the clicked item), then deselect.
   * Ignored while input is modal. The pointer is over the panel afterwards.
   */
  clickInventory(itemId: string): RunInfo | null {
    const player = this.requireInventoryItem(itemId);
    this.pointer_ = { kind: "inventory", item: itemId };
    if (this.modal.isModal) {
      this.tracer.emit("input.ignored", { reason: "modal", inventory: itemId });
      return null;
    }
    const selected = this.selected;
    if (selected === null || selected === itemId) {
      this.selectItem(itemId);
      return null;
    }
    this.selected = null;
    this.tracer.emit("select", { item: null, reason: "used" });
    return this.useOn(selected, itemId, "inventory", player);
  }

  get inventorySlots(): number {
    return this.content.pkg.game.ui?.inventorySlots ?? DEFAULT_INVENTORY_SLOTS;
  }

  /** Move the visible inventory window by `delta` slots, clamped to [0, max(0, items − slots)]. */
  scrollInventory(delta: number): number {
    if (!Number.isInteger(delta)) throw new EngineError(EngineErrorCode.BadArgument, `scroll delta must be an integer, got ${delta}`);
    const max = Math.max(0, this.playerInventory().length - this.inventorySlots);
    const next = clamp(this.inventoryOffset + delta, 0, max);
    if (next !== this.inventoryOffset) {
      this.inventoryOffset = next;
      this.tracer.emit("inventory.scroll", { offset: next });
    }
    return next;
  }

  inventory(): InventoryView {
    const items = [...this.playerInventory()];
    const slots = this.inventorySlots;
    const offset = this.inventoryOffset;
    return {
      items,
      offset,
      slots,
      visible: items.slice(offset, offset + slots),
      selected: this.selected,
      canScrollBack: offset > 0,
      canScrollForward: offset + slots < items.length,
    };
  }

  /** Walk the player to a spot of its scene through the real runtime (walk event + movement). */
  walkPlayerTo(spot: string): RunInfo {
    const { player, sceneId } = this.playerScene("walkPlayerTo");
    return this.uiRun(
      (p) => [
        { id: `${p}.entry`, type: "entry", name: p, next: [`${p}.walk`] },
        { id: `${p}.walk`, type: "walk_to", actor: player, spot, scene: sceneId },
      ],
      { walkTo: spot },
      noop,
    );
  }

  // ---------------------------------------------------------------------------
  // Scene geometry (spec 03)
  // ---------------------------------------------------------------------------

  space(sceneId: string): SceneSpace {
    const s = this.spaces.get(sceneId);
    if (s === undefined) throw new EngineError(EngineErrorCode.BadArgument, `unknown scene "${sceneId}"`);
    return s;
  }

  findPath(sceneId: string, from: Vec2, to: Vec2): PathResult | null {
    return this.space(sceneId).findPath(from, to);
  }

  drawOrder(sceneId: string): DrawItem[] {
    return drawOrder(this.content, this.world_, this.space(sceneId));
  }

  actorScale(actorId: string): ScaleInfo {
    const scene = this.world_.actors.get(actorId)?.scene;
    if (scene === undefined || scene === null) throw new EngineError(EngineErrorCode.BadArgument, `actor "${actorId}" is not in a scene`);
    return actorScale(this.content, this.world_, this.space(scene), actorId);
  }

  activeZones(actorId: string): readonly string[] {
    return this.nav.activeZones(actorId);
  }

  isMoving(actorId: string): boolean {
    return this.nav.isMoving(actorId);
  }

  transitions(): TransitionState[] {
    return this.runtime.activeTransitions();
  }

  idleReport(): IdleReport {
    const r = {
      runs: this.runtime.activeRunCount(),
      pendingCommands: this.runtime.pendingCommands().length,
      moving: this.nav.movingCount,
      modalLocks: this.modal.count,
      transitions: this.runtime.activeTransitions().length,
    };
    return { idle: r.runs + r.pendingCommands + r.moving + r.modalLocks + r.transitions === 0, ...r };
  }

  /** Devtools: lock or unlock a portal. */
  setPortalLocked(portalId: string, locked: boolean): void {
    if (!this.world_.setPortalLocked(portalId, locked)) throw new EngineError(EngineErrorCode.BadArgument, `unknown portal "${portalId}"`);
  }

  /** Devtools: place an actor freely in its scene (zone membership is updated). */
  setActorPosition(actorId: string, pos: Vec2, facing?: Facing): void {
    this.nav.cancel(actorId);
    if (!this.world_.setActorPosition(actorId, pos, facing)) throw new EngineError(EngineErrorCode.BadArgument, `unknown actor "${actorId}"`);
    this.nav.placed(actorId);
    this.sched.settle();
  }
}

function noop(): void {}

/** ISO-8601 UTC for simulated time, counted from 2000-01-01 (deterministic default for save timestamps). */
export function isoFromSimulatedMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const days = Math.floor(total / 86400000) + 10957; // days from 1970-01-01 to 2000-01-01
  const rest = total % 86400000;
  // Civil date from days since the epoch (proleptic Gregorian calendar).
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  const p2 = (n: number, w = 2): string => String(n).padStart(w, "0");
  return `${p2(y, 4)}-${p2(m)}-${p2(d)}T${p2(Math.floor(rest / 3600000))}:${p2(Math.floor(rest / 60000) % 60)}:${p2(Math.floor(rest / 1000) % 60)}.${p2(rest % 1000, 3)}Z`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
