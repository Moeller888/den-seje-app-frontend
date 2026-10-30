/**
 * Browser game: wires the headless engine to the Pixi renderer, the DOM UI
 * layers and the input pipeline.
 *
 * Authority: all game state lives in core. The renderer and the UI read it
 * every frame and send input (hover, clicks, inventory clicks, replies) back.
 * Time: a requestAnimationFrame loop advances core's simulated clock by the
 * real elapsed time (capped), so logic still runs in fixed 60 Hz ticks.
 * Saves (phase 5): slots, settings and autosave live in the save package; the
 * pause menu pauses the clock while it is open.
 */

import { WebAudioBackend, browserAudioEnv } from "@adventure-engine/audio";
import { kindOf, loadContent, type Facing, type LoadedContent, type MediaManifest } from "@adventure-engine/content";
import { Engine, RuntimeCode, type ClickTarget, type Command } from "@adventure-engine/core";
import {
  MEDIA_WARNING_CODES,
  MediaPresenter,
  TimelineBackend,
  VideoCutsceneBackend,
  chooseFormat,
  ownerScene,
  schedulerClock,
  type CutsceneBackend,
  type VariantChoice,
} from "@adventure-engine/media";
import {
  AssetManager,
  PixiSceneRenderer,
  clientToLogical,
  letterbox,
  loadImageTexture,
  placeholderTexture,
  sceneAssetIds,
  sceneAudioIds,
  variantAssetIds,
  type AssetManifest,
  type Letterbox,
} from "@adventure-engine/render-pixi";
import { Autosaver, IndexedDbMirror, SLOT_NAMES, SettingsStore, SlotManager, type SaveStorage, type WriteResult } from "@adventure-engine/save";
import type { Texture } from "pixi.js";
import { BrowserAdapter } from "./adapter.ts";
import { cursorView } from "./model/cursor.ts";
import { sceneHotspots } from "./model/hotspots.ts";
import { continueChoice, formatPlayTime, savePlayerScene, slotInfo, type SlotInfo } from "./model/saves.ts";
import { format, type AppSettings } from "./model/settings.ts";
import { CutsceneView } from "./ui/cutscene.ts";
import { DialogView } from "./ui/dialog.ts";
import { byId, el } from "./ui/dom.ts";
import { CursorLayer, HotspotList, tooltipText } from "./ui/hud.ts";
import { InventoryPanel } from "./ui/inventory.ts";
import { GameMenu, type SlotRow } from "./ui/menu.ts";

/** Longer frames (tab switch, debugger) are capped so the game does not jump far ahead. */
const MAX_FRAME_MS = 250;
const LOADING_DELAY_MS = 300;
const REACT_NOTICE_MS = 1600;
/** Largest save file accepted by "Importér" (release review: bounded import). */
export const MAX_SAVE_IMPORT_BYTES = 4 * 1024 * 1024;
/** Texture cache budget (spec 06 F8.3); the demo stays far below it. */
const TEXTURE_BUDGET_BYTES = 32 * 1024 * 1024;

/** Where saves and settings are kept (main.ts picks IndexedDB, then localStorage, then memory). */
export interface SaveServices {
  readonly storage: SaveStorage;
  /** "indexeddb" | "localstorage" | "memory", mirrored as data-storage. */
  readonly kind: string;
  /** Resolves when every write so far has reached the store. */
  flush(): Promise<void>;
}

export class Game {
  readonly content: LoadedContent;
  readonly engine: Engine;
  private readonly settings: AppSettings;
  private readonly manifest: MediaManifest;
  private readonly adapter = new BrowserAdapter();
  private readonly assets: AssetManager<Texture>;
  readonly media: MediaPresenter;
  readonly audio: WebAudioBackend;
  private readonly cutsceneView: CutsceneView;
  private readonly muteButton: HTMLButtonElement;
  private readonly menuButton: HTMLButtonElement;
  private readonly store: SaveServices;
  readonly slots: SlotManager;
  private readonly settingsStore: SettingsStore;
  private readonly autosaver: Autosaver;
  private readonly menu: GameMenu;
  /** A menu save whose `game.save` logic is still running: the clock keeps going until it ends. */
  private saveInFlight = false;
  private saveSeq = 0;
  private lastSignal = "";
  private rafId = 0;
  private destroyed = false;
  private readonly unlockAudio = (): void => this.onFirstGesture();
  private renderer: PixiSceneRenderer | null = null;
  private readonly root = byId("game");
  private readonly overlay = byId("overlay");
  private readonly surface = byId("surface");
  private readonly fadeNode = byId("fade");
  private readonly loading = byId("loading");
  private readonly notice = byId("notice");
  private readonly live = byId("live");
  private readonly titleScreen = byId("title-screen");
  private readonly langbar = byId("langbar");
  private readonly dialog: DialogView;
  private readonly inventory: InventoryPanel;
  private readonly hotspots: HotspotList;
  private readonly cursor: CursorLayer;
  private readonly clickFeedbackMs: number;
  private box: Letterbox = { scale: 0, offsetX: 0, offsetY: 0, width: 0, height: 0 };
  private pointer: [number, number] | null = null;
  private started = false;
  private languageDirty = true;
  private warningsSeen = 0;
  private lastFrame = 0;
  private noticeTimer: number | null = null;
  private readonly logical: { width: number; height: number };

  constructor(raw: unknown, manifest: MediaManifest, settings: AppSettings, store: SaveServices) {
    this.content = loadContent(raw);
    this.settings = settings;
    this.manifest = manifest;
    this.store = store;
    this.engine = new Engine(this.content, {
      seed: settings.seed,
      adapter: this.adapter,
      devMode: settings.dev,
      // Save timestamps are real time in the browser; core itself never reads a clock.
      wallClock: () => new Date().toISOString(),
      ...(settings.language !== null ? { language: settings.language } : {}),
    });
    const contentId = this.content.pkg.game.id;
    this.slots = new SlotManager(store.storage, contentId);
    this.settingsStore = new SettingsStore(store.storage, contentId);
    this.autosaver = new Autosaver(this.engine, this.slots);
    this.autosaver.onSaved = (_reason, result) => this.afterWrite("auto", result, false);
    if (store.storage instanceof IndexedDbMirror) {
      store.storage.onError = (err) => {
        console.error("[save] IndexedDB write failed", err);
        this.showNotice(format(this.engine.text.t("ui.save_failed"), { reason: err instanceof Error ? err.message : String(err) }), false);
      };
    }
    this.logical = { ...(this.content.pkg.game.viewport ?? { width: 1280, height: 720 }) };
    const ui = this.content.pkg.game.ui ?? {};
    this.clickFeedbackMs = ui.clickFeedbackMs ?? 200;
    this.root.classList.toggle("reduced-motion", settings.reducedMotion);
    this.overlay.style.width = `${this.logical.width}px`;
    this.overlay.style.height = `${this.logical.height}px`;
    byId("inventory").style.height = `${ui.inventoryHeight ?? 96}px`;
    // Images and atlases go through the texture manager; audio and video are chosen by format later.
    const pictures: Record<string, { url: string }> = {};
    for (const [id, e] of Object.entries(manifest)) if ((kindOf(e) === "image" || kindOf(e) === "atlas") && e.url !== undefined) pictures[id] = { url: e.url };
    const pictureManifest: AssetManifest = pictures;
    const placeholder = placeholderTexture(settings.dev);
    this.assets = new AssetManager<Texture>({
      manifest: pictureManifest,
      loader: loadImageTexture,
      placeholder: () => placeholder,
      onWarning: (_id, message) => this.engine.reportWarning(RuntimeCode.AssetLoad, message),
      cache: {
        budgetBytes: TEXTURE_BUDGET_BYTES,
        bytes: (id) => manifest[id]?.bytes ?? 0,
        release: (id, texture) => {
          this.renderer?.releaseAtlas(id);
          if (texture !== placeholder) texture.destroy(true);
        },
      },
    });
    const clock = schedulerClock(this.engine.sched);
    this.cutsceneView = new CutsceneView(byId("cutscene"));
    this.audio = new WebAudioBackend(browserAudioEnv(), manifest);
    this.media = new MediaPresenter(
      {
        content: this.content,
        clock,
        reply: (cmdId) => this.reply(cmdId, { kind: "done" }),
        signal: (entity, name) => {
          this.lastSignal = `${entity}:${name}`;
          this.engine.signal(entity, name);
        },
        warn: (code, message) => this.engine.reportWarning(MEDIA_WARNING_CODES[code], message),
        variantOf: (e) => this.engine.world.actors.get(e)?.variant ?? this.engine.world.objects.get(e)?.variant ?? null,
        ownerScene: (e) => ownerScene(this.engine.world, e),
        playerScene: () => this.playerScene(),
      },
      { audio: this.audio, cutscene: (choice) => this.cutsceneBackend(choice, clock) },
    );
    this.audio.unlockListener = () => this.media.mixer.unlocked();
    // Stored settings (spec 05 E2): mute and master volume; the language is chosen in main.ts.
    const stored = this.settingsStore.load();
    this.media.mixer.setMuted(stored.muted);
    this.media.mixer.setMaster(stored.master);
    this.muteButton = el("button", { type: "button", id: "mute", class: "mute", "aria-pressed": "false" });
    this.muteButton.addEventListener("click", () => this.toggleMute());
    this.menuButton = el("button", { type: "button", id: "menu-button", class: "mute", "aria-haspopup": "dialog" });
    this.menuButton.hidden = true;
    this.menuButton.addEventListener("click", () => this.openMenu());
    const t = (key: string): string => this.engine.text.t(key);
    this.menu = new GameMenu({
      host: byId("game-menu"),
      text: t,
      slots: () => this.slotRows(),
      inGame: () => this.started,
      resume: () => this.menu.close(),
      save: (slot) => this.saveToSlot(slot),
      load: (slot) => this.loadSlot(slot),
      restoreBackup: (slot) => this.restoreBackup(slot),
      exportSave: () => this.exportSave(),
      importSave: (file) => this.importSave(file),
      toTitle: () => this.toTitle(),
    });
    this.dialog = new DialogView({
      speechLayer: byId("speech-layer"),
      menuHost: byId("menu"),
      live: this.live,
      text: t,
      nameOf: (actor) => this.nameOf(actor),
      speaker: (actor) => this.speakerAnchor(actor),
      viewport: this.logical,
      bottomInset: 24,
      reply: (cmdId, reply) => this.reply(cmdId, reply),
    });
    this.inventory = new InventoryPanel({
      host: byId("inventory"),
      text: t,
      nameOf: (item) => this.nameOf(item),
      iconUrl: (item) => this.iconUrl(item),
      click: (item) => {
        this.engine.clickInventory(item);
        this.cursor.flash(this.clickFeedbackMs);
      },
      hover: (item) => {
        if (this.started) this.engine.hoverInventory(item);
      },
      scroll: (delta) => this.engine.scrollInventory(delta),
      iconFailed: (item, url) => this.engine.reportWarning(RuntimeCode.AssetLoad, `inventory icon of "${item}" (${url}) could not be loaded`),
    });
    this.hotspots = new HotspotList({ host: byId("hotspots"), text: t, activate: (target) => this.activate(target) });
    this.cursor = new CursorLayer(byId("cursor"), byId("tooltip"));
    this.adapter.attach({
      say: (cmd) => this.dialog.say(cmd),
      choose: (cmd) => this.dialog.showChoose(cmd),
      dialogEnd: () => this.dialog.clear(),
      fade: (direction, ms) => this.fade(direction, ms),
      preloadScene: (sceneId) => this.preloadScene(sceneId),
      preloadVariant: (entity, variant) => this.preload(variantAssetIds(this.content, entity, variant)),
      react: (cmd) => this.react(cmd),
      done: (cmdId) => this.reply(cmdId, { kind: "done" }),
    }, this.media);
  }

  /** The rng seed of this game (devtools). */
  get seed(): string {
    return this.settings.seed;
  }

  private playerScene(): string | null {
    const p = this.engine.world.playerId;
    return p === null ? null : (this.engine.world.actors.get(p)?.scene ?? null);
  }

  /** Cutscene backend for a chosen variant: a video element, or the timeline shown by the cutscene layer. */
  private cutsceneBackend(choice: VariantChoice, clock: ReturnType<typeof schedulerClock>): CutsceneBackend {
    const video = choice.variant.video;
    if (video !== undefined) {
      const entry = this.manifest[video];
      const probe = document.createElement("video");
      const fmt = entry === undefined ? null : chooseFormat(entry, (t) => probe.canPlayType(t) !== "");
      return new VideoCutsceneBackend(this.cutsceneView, fmt?.url ?? null);
    }
    const timeline = new TimelineBackend(clock);
    this.cutsceneView.track(timeline, choice);
    return timeline;
  }

  private toggleMute(): void {
    this.media.mixer.setMuted(!this.media.mixer.muted);
    this.settingsStore.update({ muted: this.media.mixer.muted });
    this.renderLangbar();
  }

  /** Browser audio may only start after a real user gesture (spec 06 F4 autoplay). */
  private onFirstGesture(): void {
    if (this.audio.state === "locked") this.audio.unlock();
    window.removeEventListener("pointerdown", this.unlockAudio, true);
    window.removeEventListener("keydown", this.unlockAudio, true);
  }

  /** Release every media object, timer and listener (page hide). */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.rafId);
    this.onFirstGesture();
    this.media.dispose();
    this.assets.clear();
    this.renderer?.destroy();
    this.renderer = null;
  }

  /** Create the renderer, wire input and show the title screen. */
  async mount(): Promise<void> {
    this.installInput();
    this.layout();
    new ResizeObserver(() => this.layout()).observe(this.root);
    this.renderTitle();
    this.renderLangbar();
    try {
      this.renderer = await PixiSceneRenderer.create({
        host: byId("stage"),
        logical: this.logical,
        assets: this.assets,
        showZones: this.settings.zones,
        animation: (entity) => {
          const v = this.media.animator.view(entity);
          return v === null ? null : { atlas: v.player.def.atlas, frames: v.player.state.frames };
        },
        atlasOf: (id) => this.manifest[id]?.atlas,
        placeholder: placeholderTexture(this.settings.dev),
        onWarning: (message) => this.engine.reportWarning(RuntimeCode.AssetLoad, message),
      });
      this.renderer.resize(this.box);
    } catch (err) {
      // Fail loud, stay playable: the DOM UI and the hotspot list still work.
      console.error("[render] could not start the renderer", err);
      this.showNotice(this.engine.text.t("ui.graphics_failed"), true);
      this.root.dataset["renderer"] = "failed";
    }
    this.root.dataset["renderer"] ??= "pixi";
    window.addEventListener("pointerdown", this.unlockAudio, true);
    window.addEventListener("keydown", this.unlockAudio, true);
    // Autosave when the page is hidden (tab switch, reload, close; spec 05 E3.2).
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && this.started) this.autosaver.request("hidden");
    });
    window.addEventListener("pagehide", () => this.destroy());
    this.rafId = requestAnimationFrame((now) => {
      this.lastFrame = now;
      this.frame(now);
    });
  }

  async startNewGame(): Promise<void> {
    this.titleScreen.hidden = true;
    this.dialog.clear();
    this.fadeNode.style.transition = "none";
    this.fadeNode.style.opacity = "1";
    const player = this.engine.world.playerId;
    const scene = player === null ? null : (this.engine.world.actors.get(player)?.scene ?? null);
    if (scene !== null) await this.preloadScene(scene);
    this.started = true;
    this.engine.newGame();
    this.root.focus({ preventScroll: true });
  }

  /** Switch the language; `persist` stores it as the user's choice (false for the start language). */
  setLanguage(lang: string, persist = true): void {
    this.engine.setLanguage(lang);
    if (persist) this.settingsStore.update({ language: lang });
    this.languageChanged();
  }

  private languageChanged(): void {
    document.documentElement.lang = this.engine.text.language;
    document.title = this.engine.text.t("ui.title");
    this.languageDirty = true;
    this.renderTitle();
    this.renderLangbar();
    this.menu.refresh();
  }

  // ---------------------------------------------------------------------------
  // Save / load (spec 05, phase 5)
  // ---------------------------------------------------------------------------

  private openMenu(): void {
    if (!this.started || this.menu.open) return;
    this.menu.show("pause");
  }

  private slotLabel(slot: string): string {
    const t = (k: string): string => this.engine.text.t(k);
    return slot === "auto" ? t("ui.slot.auto") : format(t("ui.slot"), { n: slot.replace(/^slot/, "") });
  }

  private slotInfos(): SlotInfo[] {
    return SLOT_NAMES.map((name) => slotInfo(name, this.slots.read(name)));
  }

  private slotRows(): SlotRow[] {
    return this.slotInfos().map((i) => {
      const parts: string[] = [];
      if (i.savedAt !== null) {
        const d = new Date(i.savedAt);
        if (!Number.isNaN(d.getTime())) parts.push(d.toLocaleString(this.engine.text.language, { dateStyle: "short", timeStyle: "short" }));
      }
      if (i.playTimeMs !== null) parts.push(format(this.engine.text.t("ui.playtime"), { time: formatPlayTime(i.playTimeMs) }));
      return { slot: i.slot, label: this.slotLabel(i.slot), state: i.state, details: parts.join(" · "), backup: i.backup };
    });
  }

  /** After a slot write: report failures, and mirror data-last-save once the write reached the store. */
  private afterWrite(slot: string, result: WriteResult, announce: boolean): void {
    if (!result.ok) {
      this.root.dataset["lastSave"] = `${slot}:failed`;
      this.showNotice(format(this.engine.text.t("ui.save_failed"), { reason: result.message }), false);
      return;
    }
    const seq = ++this.saveSeq;
    void this.store.flush().then(() => {
      this.root.dataset["lastSave"] = `${slot}:${seq}`;
    });
    if (announce) this.showNotice(this.engine.text.t("ui.saved"), false);
    this.menu.refresh();
  }

  /** Save from the menu: only when idle (spec 05 E3.1); otherwise the player is told why not. */
  private saveToSlot(slot: string): void {
    if (!this.started) return;
    let finished = false;
    this.engine.requestSave((o) => {
      finished = true;
      this.saveInFlight = false;
      if (!o.ok) {
        this.root.dataset["lastSave"] = `${slot}:rejected`;
        this.showNotice(this.engine.text.t("ui.save_blocked"), false);
        return;
      }
      this.afterWrite(slot, this.slots.write(slot, o.json), true);
    });
    if (!finished) this.saveInFlight = true;
  }

  private loadSlot(slot: string): void {
    const s = this.slots.read(slot);
    if (s.state === "ok") void this.loadRaw(s.raw);
  }

  private restoreBackup(slot: string): void {
    const r = this.slots.restoreBackup(slot);
    if (!r.ok) {
      this.showNotice(format(this.engine.text.t("ui.save_failed"), { reason: r.message }), false);
      return;
    }
    void this.store.flush();
    this.showNotice(this.engine.text.t("ui.backup_restored"), false);
    this.menu.refresh();
    if (!this.started) this.renderTitle();
  }

  /**
   * Load a save text (slot, title "Fortsæt" or import). The engine validates it
   * first; a rejected save leaves the running game (or the title screen) as it was.
   */
  private async loadRaw(raw: string): Promise<boolean> {
    const t = (k: string): string => this.engine.text.t(k);
    const scene = savePlayerScene(raw);
    if (scene !== null && this.content.scenes.has(scene)) await this.preloadScene(scene);
    const fadeBefore = this.fadeNode.style.opacity;
    const transitionBefore = this.fadeNode.style.transition;
    this.fadeNode.style.transition = "none";
    this.fadeNode.style.opacity = "1";
    const out = this.engine.load(raw);
    if (!out.ok) {
      this.fadeNode.style.opacity = fadeBefore;
      this.fadeNode.style.transition = transitionBefore;
      this.root.dataset["lastLoad"] = `rejected:${out.error.code}`;
      console.error(`[save] load rejected: ${out.error.code} ${out.error.message}`);
      this.showNotice(format(t("ui.load_failed"), { code: out.error.code }), false);
      return false;
    }
    this.menu.close();
    this.dialog.clear();
    this.titleScreen.hidden = true;
    this.pointer = null;
    this.started = true;
    this.languageChanged();
    this.root.dataset["lastLoad"] = `ok:${out.warnings.length}`;
    this.showNotice(out.warnings.length === 0 ? t("ui.loaded") : format(t("ui.loaded_repaired"), { count: String(out.warnings.length) }), false);
    this.root.focus({ preventScroll: true });
    // The saved variants may need other pictures than the world before the load.
    const now = this.playerScene();
    if (now !== null) void this.preloadScene(now);
    return true;
  }

  /** Title "Fortsæt" (TS-A03): the newest valid save, or a damaged slot's backup. */
  private async continueGame(): Promise<void> {
    const choice = continueChoice(this.slotInfos());
    if (choice === null) return;
    if (choice.fromBackup) {
      const r = this.slots.restoreBackup(choice.slot);
      if (!r.ok) {
        this.showNotice(format(this.engine.text.t("ui.save_failed"), { reason: r.message }), false);
        return;
      }
      void this.store.flush();
    }
    const s = this.slots.read(choice.slot);
    if (s.state === "ok") await this.loadRaw(s.raw);
  }

  /** Download the current game as a .json file (spec 05 E3.3 export). */
  private exportSave(): void {
    if (!this.started) return;
    this.engine.requestSave((o) => {
      if (!o.ok) {
        this.showNotice(this.engine.text.t("ui.save_blocked"), false);
        return;
      }
      const url = URL.createObjectURL(new Blob([o.json], { type: "application/json" }));
      const a = el("a", { href: url, download: `${this.content.pkg.game.id}-save.json` });
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    });
  }

  private importSave(file: File): void {
    // A save is a few kilobytes; a huge file is refused before it is read.
    if (file.size > MAX_SAVE_IMPORT_BYTES) {
      this.root.dataset["lastLoad"] = "rejected:E-SAVE-TOO-LARGE";
      this.showNotice(format(this.engine.text.t("ui.load_failed"), { code: "E-SAVE-TOO-LARGE" }), false);
      return;
    }
    file.text().then(
      (text) => void this.loadRaw(text),
      (err: unknown) => {
        console.error("[save] import could not be read", err);
        this.showNotice(format(this.engine.text.t("ui.load_failed"), { code: "E-SAVE-PARSE" }), false);
      },
    );
  }

  /** Back to the title screen: autosave first when idle, then cancel everything (spec 02 B6.2). */
  private toTitle(): void {
    if (this.started) this.autosaver.request("title");
    this.menu.close();
    this.engine.backToTitle();
    this.dialog.clear();
    this.started = false;
    this.pointer = null;
    this.languageDirty = true;
    this.renderTitle();
    this.titleScreen.hidden = false;
    this.titleScreen.querySelector<HTMLButtonElement>("button.primary")?.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------------------

  private frame(now: number): void {
    if (this.destroyed) return;
    const dt = Math.min(MAX_FRAME_MS, Math.max(0, now - this.lastFrame));
    this.lastFrame = now;
    // The open pause menu stops the clock (except while a menu save's game.save logic still runs).
    if (this.started && (!this.menu.open || this.saveInFlight)) this.engine.advance(dt);
    if (this.started && !this.menu.open) this.autosaver.tick();
    this.autoAnimate();
    this.renderer?.render(this.engine);
    this.updateUi();
    this.flushWarnings();
    this.rafId = requestAnimationFrame((t) => this.frame(t));
  }

  /** Stand / walk / talk for every actor in the player's scene (phase 4); never sends anything to core. */
  private autoAnimate(): void {
    const scene = this.playerScene();
    if (scene === null) return;
    const speaker = this.dialog.speaker;
    for (const st of this.engine.world.actors.values()) {
      if (st.scene !== scene) continue;
      const mode = this.engine.isMoving(st.id) ? "walk" : speaker === st.id ? "talk" : "stand";
      this.media.animator.setAuto(st.id, mode, st.facing as Facing);
    }
  }

  private updateUi(): void {
    const e = this.engine;
    const force = this.languageDirty;
    this.languageDirty = false;
    const player = e.world.playerId;
    const scene = player === null ? null : (e.world.actors.get(player)?.scene ?? null);
    const view = cursorView(e.cursor, (id) => e.world.objects.get(id)?.nameKey ?? null);
    this.dialog.update(force);
    this.inventory.render(e.inventory(), force);
    const selected = e.selectedItem;
    this.hotspots.render(this.started && scene !== null ? sceneHotspots(this.content, e.world, scene) : [], selected === null ? null : this.nameOf(selected), e.modal.isModal, force);
    const pointerOverScene = this.pointer !== null && e.pointer?.kind === "scene";
    const pointerOverPanel = this.pointer !== null && e.pointer?.kind === "inventory";
    this.cursor.update(
      view,
      this.started && (pointerOverScene || pointerOverPanel) ? this.pointer : null,
      view.item === null ? null : this.iconUrl(view.item),
      tooltipText(view, (k) => e.text.t(k)),
    );
    const ds = this.root.dataset;
    ds["scene"] = scene ?? "";
    ds["scroll"] = String(Math.round(e.world.scrollX));
    ds["cursor"] = view.mode;
    ds["modal"] = String(e.modal.isModal);
    ds["idle"] = String(this.started && e.idleReport().idle && !this.dialog.sayOpen && !this.dialog.menuOpen);
    ds["selected"] = selected ?? "";
    ds["lang"] = e.text.language;
    ds["started"] = String(this.started);
    // Saves (phase 5), mirrored read-only.
    ds["menu"] = this.menu.mode;
    ds["storage"] = this.store.kind;
    ds["canSave"] = String(this.started && e.canSave());
    if (this.menuButton.hidden === this.started) this.menuButton.hidden = !this.started;
    // Media state (phase 4), mirrored read-only for observability.
    const cs = this.media.cutscenes;
    this.cutsceneView.update(cs, (asset) => this.manifest[asset]?.url ?? null, (k) => e.text.t(k), cs.skippable, force);
    ds["cutscene"] = cs.state;
    ds["cutsceneName"] = cs.name ?? "";
    ds["cutsceneVariant"] = cs.variant ?? "";
    ds["cutsceneSkip"] = cs.state !== "playing" ? "" : cs.canSkip() ? "ready" : cs.skippable ? "wait" : "no";
    ds["audio"] = this.audio.state;
    ds["muted"] = String(this.media.mixer.muted);
    ds["sounds"] = this.media.mixer.playing().map((p) => `${p.entity}:${p.name}`).join(",");
    ds["lastSignal"] = this.lastSignal;
    const p = e.world.playerId;
    ds["playerAnim"] = p === null ? "" : (this.media.animator.view(p)?.name ?? "");
  }

  private flushWarnings(): void {
    const list = this.engine.warnings;
    for (; this.warningsSeen < list.length; this.warningsSeen++) {
      const w = list[this.warningsSeen];
      if (w !== undefined) console.warn(`[engine] ${w.code}: ${w.message}`);
    }
  }

  private reply(cmdId: string, reply: { kind: "done" } | { kind: "choice"; optionId: string }): void {
    if (!this.engine.pendingCommands().some((c) => c.cmdId === cmdId)) return;
    this.engine.reply(cmdId, reply);
  }

  private nameOf(id: string): string {
    const key = this.engine.world.objects.get(id)?.nameKey ?? this.content.actors.get(id)?.nameKey ?? null;
    return key === null ? id : this.engine.text.t(key);
  }

  private iconUrl(item: string): string | null {
    const icon = this.content.objects.get(item)?.icon;
    return icon === undefined ? null : (this.manifest[icon]?.url ?? null);
  }

  /** Pictures, atlases and audio of a scene (spec 06 F8.2); the scene and its portal neighbours stay pinned. */
  private async preloadScene(sceneId: string): Promise<void> {
    const world = this.engine.world;
    const neighbours = (this.content.pkg.portals ?? []).filter((p) => p.from === sceneId).map((p) => p.to);
    const pinned = new Set([sceneId, ...neighbours].flatMap((s) => sceneAssetIds(this.content, world, s)));
    this.assets.pin(pinned);
    await Promise.all([this.preload(sceneAssetIds(this.content, world, sceneId)), this.audio.preload(sceneAudioIds(this.content, world, sceneId))]);
  }

  private speakerAnchor(actor: string): { feet: readonly [number, number] | null; height: number; region: unknown; scrollX: number } {
    const e = this.engine;
    const player = e.world.playerId;
    const scene = player === null ? null : (e.world.actors.get(player)?.scene ?? null);
    const st = e.world.actors.get(actor);
    const here = scene !== null && st?.scene === scene && st.pos !== null;
    const height = here ? (e.actorScale(actor).effectiveHeightPx ?? this.content.actors.get(actor)?.hitBox?.height ?? 100) : 100;
    return {
      feet: here ? (st?.pos ?? null) : null,
      height,
      region: scene === null ? undefined : e.space(scene).def.speechRegions?.[actor],
      scrollX: e.world.scrollX,
    };
  }

  private activate(target: ClickTarget): void {
    this.engine.click(target);
  }

  private async preload(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const timer = window.setTimeout(() => {
      this.loading.hidden = false;
    }, LOADING_DELAY_MS);
    try {
      await this.assets.load(ids, (p) => {
        this.loading.textContent = `${this.engine.text.t("ui.loading")} ${p.done}/${p.total}`;
      });
    } finally {
      window.clearTimeout(timer);
      this.loading.hidden = true;
    }
  }

  private fade(direction: "in" | "out", ms: number): Promise<void> {
    const duration = this.settings.reducedMotion ? 0 : ms;
    this.fadeNode.style.transition = duration > 0 ? `opacity ${duration}ms linear` : "none";
    this.fadeNode.style.opacity = direction === "out" ? "1" : "0";
    this.fadeNode.dataset["direction"] = direction;
    return new Promise((resolve) => window.setTimeout(resolve, duration));
  }

  private react(cmd: Extract<Command, { type: "React" }>): void {
    this.root.classList.remove("cannot");
    void this.root.offsetWidth;
    this.root.classList.add("cannot");
    if (cmd.textKey !== undefined) this.showNotice(`${this.nameOf(cmd.actor)}: ${this.engine.text.t(cmd.textKey)}`, false);
  }

  private showNotice(text: string, sticky: boolean): void {
    this.notice.textContent = text;
    this.notice.hidden = false;
    if (this.noticeTimer !== null) window.clearTimeout(this.noticeTimer);
    this.noticeTimer = sticky
      ? null
      : window.setTimeout(() => {
          this.notice.hidden = true;
        }, REACT_NOTICE_MS);
  }

  // ---------------------------------------------------------------------------
  // Input pipeline: client → logical (letterbox) → scene (scroll) → engine
  // ---------------------------------------------------------------------------

  private layout(): void {
    const r = this.root.getBoundingClientRect();
    this.box = letterbox({ width: r.width, height: r.height }, this.logical);
    this.overlay.style.transform = `translate(${this.box.offsetX}px, ${this.box.offsetY}px) scale(${this.box.scale})`;
    this.renderer?.resize(this.box);
  }

  private toLogical(ev: PointerEvent): [number, number] | null {
    const r = this.root.getBoundingClientRect();
    return clientToLogical([ev.clientX - r.left, ev.clientY - r.top], this.box, this.logical);
  }

  private installInput(): void {
    this.surface.addEventListener("pointermove", (ev) => {
      if (!this.started) return;
      const p = this.toLogical(ev);
      this.pointer = p;
      if (p === null) this.engine.pointerLeave();
      else this.engine.hover(this.engine.screenToScene(p));
    });
    this.surface.addEventListener("pointerleave", () => {
      this.pointer = null;
      if (this.started) this.engine.pointerLeave();
    });
    // The pointer position is also tracked over the UI (inventory cursor, tooltip).
    this.root.addEventListener("pointermove", (ev) => {
      if (ev.target !== this.surface) this.pointer = this.toLogical(ev);
    });
    byId("inventory").addEventListener("pointerleave", () => {
      if (this.started && this.engine.pointer?.kind === "inventory") this.engine.pointerLeave();
    });
    // A speech bubble is confirmed by a click anywhere in the game (except the
    // language switch, a system control); that click does nothing else.
    this.root.addEventListener(
      "pointerdown",
      (ev) => {
        if (ev.button !== 0) return;
        if (ev.target instanceof Node && (this.langbar.contains(ev.target) || this.menu.host.contains(ev.target))) return;
        // During a cutscene only skip input is accepted (spec 06 F6); scene and inventory are locked.
        if (this.media.cutscenes.state === "playing") {
          ev.preventDefault();
          ev.stopPropagation();
          this.media.skipCutscene();
          return;
        }
        if (!this.dialog.sayOpen) return;
        ev.preventDefault();
        ev.stopPropagation();
        this.dialog.confirmSay();
      },
      { capture: true },
    );
    this.surface.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0 || !this.started || this.dialog.menuOpen) return;
      const p = this.toLogical(ev);
      if (p === null) return;
      this.pointer = p;
      this.cursor.flash(this.clickFeedbackMs);
      this.engine.clickAt(this.engine.screenToScene(p));
    });
    window.addEventListener("keydown", (ev) => {
      // The open menu owns the keyboard; Escape goes back (also when focus is outside it).
      if (this.menu.open) {
        if (ev.key === "Escape") {
          ev.preventDefault();
          this.menu.back();
        }
        return;
      }
      if (!this.started) return;
      if (this.media.cutscenes.state === "playing") {
        if (ev.key === "Enter" || ev.key === " " || ev.key === "Escape") {
          ev.preventDefault();
          this.media.skipCutscene();
        }
        return;
      }
      if (this.dialog.key(ev.key)) {
        ev.preventDefault();
        return;
      }
      if (ev.key === "Escape" && this.engine.selectedItem !== null) {
        this.engine.clearSelection();
        ev.preventDefault();
      } else if (ev.key === "Escape") {
        // Escape with nothing selected opens the pause menu (spec 05 E3.3).
        ev.preventDefault();
        this.openMenu();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Title screen and language switch (spec 06 F7: language choice in the menus)
  // ---------------------------------------------------------------------------

  private renderTitle(): void {
    const t = (k: string): string => this.engine.text.t(k);
    const start = el("button", { type: "button", class: "primary", id: "start", text: t("ui.start") });
    start.addEventListener("click", () => void this.startNewGame());
    // "Fortsæt" and "Indlæs spil" only when there is something to continue (TS-A03).
    const infos = this.slotInfos();
    const choice = continueChoice(infos);
    const actions: HTMLElement[] = [];
    if (choice !== null) {
      const cont = el("button", { type: "button", class: "primary", id: "continue", "data-backup": String(choice.fromBackup), text: t(choice.fromBackup ? "ui.continue_backup" : "ui.continue_game") });
      cont.addEventListener("click", () => void this.continueGame());
      actions.push(cont);
    }
    actions.push(start);
    if (infos.some((i) => i.state !== "empty")) {
      const load = el("button", { type: "button", class: "secondary", id: "title-load", text: t("ui.load_game") });
      load.addEventListener("click", () => this.menu.show("load"));
      actions.push(load);
    }
    this.titleScreen.replaceChildren(
      el("h1", { text: t("ui.title") }),
      el("p", { class: "subtitle", text: t("ui.subtitle") }),
      this.languageButtons("title-lang"),
      ...actions,
      el("p", { class: "help", text: t("ui.help_keys") }),
    );
  }

  private renderLangbar(): void {
    const muted = this.media.mixer.muted;
    this.muteButton.setAttribute("aria-pressed", String(muted));
    this.muteButton.setAttribute("aria-label", this.engine.text.t("ui.sound_off"));
    this.muteButton.textContent = muted ? `🔇 ${this.engine.text.t("ui.sound_off")}` : `🔊 ${this.engine.text.t("ui.sound")}`;
    this.menuButton.textContent = this.engine.text.t("ui.menu");
    this.langbar.replaceChildren(this.languageButtons("bar-lang"), this.muteButton, this.menuButton);
  }

  private languageButtons(name: string): HTMLElement {
    const group = el("div", { class: "langs", role: "group", "aria-label": this.engine.text.t("ui.language") });
    for (const lang of this.engine.text.languages) {
      const b = el("button", { type: "button", "data-lang": lang, "aria-pressed": String(lang === this.engine.text.language), name, text: this.engine.text.t(`ui.lang.${lang}`) });
      b.addEventListener("click", () => this.setLanguage(lang));
      group.append(b);
    }
    return group;
  }
}
