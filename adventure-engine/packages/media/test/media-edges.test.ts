import { loadContent, type AnimationDef, type ContentPackage } from "@adventure-engine/content";
import { Engine, type Command } from "@adventure-engine/core";
import { describe, expect, it } from "vitest";
import {
  AnimationPlayer,
  Animator,
  CutscenePlayer,
  HeadlessAudioBackend,
  LruCache,
  ManualClock,
  MediaPresenter,
  SoundMixer,
  TimelineBackend,
  VideoCutsceneBackend,
  ownerScene,
  type AudioBackend,
  type BackendPlayback,
  type CutsceneBackend,
  type VideoLike,
} from "../src/index.ts";

const pkg = (extra: Partial<ContentPackage> = {}): ContentPackage => ({
  game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", player: { actor: "hero" }, entry: null },
  scenes: [
    { id: "a", entry: null, spots: { s: { x: 1, y: 1 } }, defaultSpot: "s" },
    { id: "b", entry: null, spots: { s: { x: 1, y: 1 } }, defaultSpot: "s" },
  ],
  actors: [
    { id: "hero", scene: "a", entry: null, variants: { default: {} } },
    { id: "npc", scene: "b", entry: null, variants: { default: {} } },
  ],
  objects: [
    { id: "cup", container: { kind: "scene", id: "a" }, entry: null, variants: { default: {} } },
    { id: "key", container: { kind: "actor", id: "hero" }, entry: null, variants: { default: {} } },
    { id: "ring", container: { kind: "actor", id: "npc" }, entry: null, variants: { default: {} } },
    { id: "void", container: { kind: "none" }, entry: null, variants: { default: {} } },
  ],
  ...extra,
});

describe("media edge cases", () => {
  it("ownership for scene clean-up: scenes own themselves; the player and its inventory own nothing", () => {
    const engine = new Engine(loadContent(pkg()), { seed: "s", adapter: { onCommand: () => ({ kind: "auto", afterMs: 0 }) } });
    const w = engine.world;
    expect(["a", "hero", "npc", "cup", "key", "ring", "void", "ghost"].map((e) => ownerScene(w, e))).toEqual(["a", null, "b", "a", null, "b", null, null]);
  });

  it("player: a silent seek past loopRange; onLoop may stop the player; packages without media", () => {
    const loop: AnimationDef = { id: "l", atlas: "x", instructions: [{ op: "fps", n: 10 }, { op: "loopRange", from: 2, to: 5 }] };
    expect(AnimationPlayer.stateAt(loop, 2)).toMatchObject({ frame: 2, fps: 10, pc: 2 });
    const clock = new ManualClock();
    const p: AnimationPlayer = new AnimationPlayer(loop, clock, { onLoop: () => p.stop() });
    p.start();
    expect(p.status).toBe("stopped");
    expect(clock.pending).toBe(0);
    const empty = loadContent(pkg());
    const a = new Animator(empty, clock, { variantOf: () => null, signal: () => {} });
    expect(a.resolve("hero", "x")).toBeUndefined();
    a.setAuto("hero", "walk", "left");
    a.setAuto("hero", "walk", "right");
    expect(a.view("hero")).toBeNull();
    const m = new SoundMixer(empty, new HeadlessAudioBackend(clock), { warn: () => {} });
    expect(m.resolve("a", "x")).toBeUndefined();
  });

  it("animator: an unknown variant falls back to the default variant's animations", () => {
    const content = loadContent(pkg({ objects: [], actors: [{ id: "hero", scene: "a", entry: null, variants: { default: { animations: { wave: "w" } }, wet: {} } }], animations: [{ id: "w", atlas: "x", instructions: [{ op: "frame", n: 0 }] }] }));
    const a = new Animator(content, new ManualClock(), { variantOf: (e) => (e === "hero" ? "wet" : null), signal: () => {} });
    expect(a.resolve("hero", "wave")?.id).toBe("w");
    const b = new Animator(content, new ManualClock(), { variantOf: () => null, signal: () => {} });
    expect(b.resolve("hero", "wave")?.id).toBe("w");
    b.setAuto("hero", "stand", "left");
  });

  it("mixer: loop points reach the backend; queued loops stop without a fade; late backend callbacks are ignored; durations default to 0", () => {
    const content = loadContent(
      pkg({
        scenes: [{ id: "a", entry: null, sounds: { hum: "s.hum", blip: "s.blip" } }],
        actors: [],
        objects: [],
        game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", entry: null },
        sounds: [
          { id: "s.hum", asset: "h", channel: "ambient", durationMs: 1000, loopStartMs: 100, loopEndMs: 900 },
          { id: "s.blip", asset: "b", channel: "sfx" },
        ],
      }),
    );
    const started: BackendPlayback[] = [];
    const cbs: Array<{ ended(): void; failed(m: string): void }> = [];
    const stops: Array<[number, number]> = [];
    const backend: AudioBackend & { locked: boolean } = {
      locked: true,
      start: (p, cb) => {
        started.push(p);
        cbs.push(cb);
      },
      setVolume: () => {},
      stop: (id, fade) => void stops.push([id, fade]),
      dispose: () => {},
    };
    const m = new SoundMixer(content, backend, { warn: () => {} });
    const loop = m.play({ entity: "a", name: "hum", times: "loop", volume: 1, ownerRun: "r" }, () => {});
    m.stop("a", "hum");
    expect(stops).toEqual([[loop?.id ?? -1, 0]]);
    backend.locked = false;
    m.play({ entity: "a", name: "hum", times: "loop", volume: 1, ownerRun: "r" }, () => {});
    expect(started[0]).toMatchObject({ loopStartMs: 100, loopEndMs: 900, durationMs: 1000 });
    let done = 0;
    m.play({ entity: "a", name: "blip", times: 1, volume: 1, ownerRun: "r" }, () => done++);
    expect(started[1]).not.toHaveProperty("durationMs");
    m.stop("a", "blip");
    cbs[1]?.ended();
    expect(done).toBe(0);
    const clock = new ManualClock();
    const hb = new HeadlessAudioBackend(clock);
    hb.start({ id: 1, asset: "b", times: 2, volume: 1 }, { ended: () => done++, failed: () => {} });
    clock.advance(0);
    expect(done).toBe(1);
    hb.stop(99, 500);
    hb.start({ id: 2, asset: "b", times: "loop", volume: 1 }, { ended: () => {}, failed: () => {} });
    hb.start({ id: 3, asset: "b", times: "loop", volume: 1 }, { ended: () => {}, failed: () => {} });
    hb.stop(3, 500);
    hb.dispose();
    expect([hb.volumes.size, hb.fading.size, clock.pending]).toEqual([0, 0, 0]);
  });

  it("cutscene player: late callbacks from a replaced or cleared backend are ignored; skip state", () => {
    const clock = new ManualClock();
    const cbs: Array<{ ended(): void; failed(m: string): void }> = [];
    const backend = (): CutsceneBackend => ({ start: (_s, cb) => void cbs.push(cb), hold: () => {}, clear: () => {} });
    const warnings: string[] = [];
    const cp = new CutscenePlayer(clock, backend, { warn: (c) => warnings.push(c) });
    let done = 0;
    const def = { variants: { default: { video: "v" } }, skippable: true, skipAfterMs: 50 };
    cp.play("a", def, "da", false, () => done++);
    expect([cp.skippable, cp.canSkip()]).toEqual([true, false]);
    clock.advance(50);
    expect(cp.canSkip()).toBe(true);
    cp.play("b", def, "da", false, () => done++);
    cbs[0]?.ended();
    cbs[0]?.failed("late");
    cp.clear();
    cbs[1]?.ended();
    expect([done, warnings, cp.skippable, cp.canSkip()]).toEqual([0, [], false, false]);
  });

  it("presenter without trace: scene exit keeps other scenes' animations; no player scene; dispose clears pending timers", () => {
    const content = loadContent(
      pkg({
        actors: [
          { id: "hero", scene: "a", entry: null, variants: { default: { animations: { w: "w" } } } },
          { id: "npc", scene: "b", entry: null, variants: { default: { animations: { w: "w" } } } },
        ],
        animations: [{ id: "w", atlas: "x", instructions: [{ op: "fps", n: 10 }, { op: "loopRange", from: 0, to: 1 }] }],
      }),
    );
    const clock = new ManualClock();
    const replies: string[] = [];
    const p = new MediaPresenter(
      {
        content,
        clock,
        reply: (id) => replies.push(id),
        signal: () => {},
        warn: () => {},
        variantOf: () => "default",
        ownerScene: (e) => (e === "npc" ? "b" : "a"),
        playerScene: () => null,
      },
      { audio: new HeadlessAudioBackend(clock), cutscene: () => new TimelineBackend(clock) },
    );
    p.animator.setAuto("hero", "walk", "left");
    p.animator.setAuto("npc", "walk", "left");
    p.onSceneExit("a");
    expect(p.animator.entities()).toEqual(["npc"]);
    const cmd = { cmdId: "c1", runId: "r", nodeId: null, type: "PlayCutscene", cutscene: "x", language: "da", hold: false } as Command;
    expect(p.handle(cmd)).toEqual({ kind: "auto", afterMs: 0 });
    p.handle({ cmdId: "c2", runId: "r", nodeId: null, type: "PlayAnimation", entity: "npc", animation: "w", loop: false } as Command);
    p.dispose();
    clock.advance(10);
    expect(replies).toEqual([]);
    expect(clock.pending).toBe(0);
  });

  it("cache: releasing an unknown key; has()", () => {
    const c = new LruCache<number>(10, () => {});
    c.release("nobody");
    c.put("x", 1, 5);
    expect([c.has("x"), c.has("y")]).toEqual([true, false]);
  });
});

/** A fake video element: the test decides when it ends or fails. */
class FakeVideo implements VideoLike {
  src = "";
  muted = false;
  playsInline = false;
  paused = true;
  loaded = 0;
  removedSrc = false;
  playResult: "ok" | "reject" = "ok";
  readonly listeners = new Map<string, Set<() => void>>();
  play(): Promise<void> {
    this.paused = false;
    return this.playResult === "ok" ? Promise.resolve() : Promise.reject(new Error("NotAllowedError"));
  }
  pause(): void {
    this.paused = true;
  }
  load(): void {
    this.loaded++;
  }
  removeAttribute(name: string): void {
    if (name === "src") this.removedSrc = true;
  }
  addEventListener(type: string, fn: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(fn);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, fn: () => void): void {
    this.listeners.get(type)?.delete(fn);
  }
  emit(type: string): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn();
  }
  get listenerCount(): number {
    return [...this.listeners.values()].reduce((n, s) => n + s.size, 0);
  }
}

describe("video cutscene backend (fake browser media)", () => {
  const show = { name: "v", choice: { key: "default", variant: { video: "vid" }, via: "default" as const }, hold: false };

  function host() {
    const videos: FakeVideo[] = [];
    const removed: FakeVideo[] = [];
    return { videos, removed, h: { create: () => (videos.push(new FakeVideo()), videos[videos.length - 1] as FakeVideo), remove: (v: VideoLike) => void removed.push(v as FakeVideo) } };
  }

  it("plays, reports the end once and removes its listeners; clear releases the element", () => {
    const { videos, removed, h } = host();
    const b = new VideoCutsceneBackend(h, "/v.webm");
    const log: string[] = [];
    b.start(show, { ended: () => log.push("ended"), failed: (m) => log.push(m) });
    const v = videos[0] as FakeVideo;
    expect([v.src, v.playsInline, v.paused, v.listenerCount, b.element === v]).toEqual(["/v.webm", true, false, 2, true]);
    v.emit("ended");
    v.emit("ended");
    expect(log).toEqual(["ended"]);
    expect(v.listenerCount).toBe(0);
    b.hold();
    expect(v.paused).toBe(true);
    b.clear();
    expect([v.removedSrc, v.loaded, removed.length, b.element]).toEqual([true, 1, 1, null]);
    b.clear();
  });

  it("errors, refused play() and missing formats fail; hold and clear stop listening", async () => {
    const log: string[] = [];
    const cb = { ended: () => log.push("ended"), failed: (m: string) => log.push(m) };
    const a = host();
    new VideoCutsceneBackend(a.h, "/a.mp4").start(show, cb);
    a.videos[0]?.emit("error");
    expect(log).toEqual(["the video could not be played"]);
    const b = host();
    const refused = new VideoCutsceneBackend(b.h, "/b.mp4");
    const fv = new FakeVideo();
    fv.playResult = "reject";
    refused.start(show, { ...cb, failed: (m) => log.push(`refused: ${m}`) });
    const c = host();
    c.h.create = () => fv;
    new VideoCutsceneBackend(c.h, "/c.mp4").start(show, cb);
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toContain("NotAllowedError");
    new VideoCutsceneBackend(c.h, null).start(show, cb);
    await Promise.resolve();
    await Promise.resolve();
    expect(log.at(-1)).toBe("no playable video format");
    const d = host();
    const held = new VideoCutsceneBackend(d.h, "/d.webm");
    held.start(show, cb);
    held.hold();
    d.videos[0]?.emit("ended");
    expect(log.filter((l) => l === "ended")).toEqual([]);
    const e = host();
    const nonVideo = new VideoCutsceneBackend(e.h, "/e.webm");
    const errVideo = new FakeVideo();
    e.h.create = () => errVideo;
    nonVideo.start(show, { ended: () => {}, failed: (m) => log.push(`late ${m}`) });
    errVideo.playResult = "reject";
    errVideo.emit("error");
    nonVideo.clear();
    expect(log.filter((l) => l.startsWith("late"))).toEqual(["late the video could not be played"]);
  });
});

describe("media edge cases 2", () => {
  it("auto animations forward signals; the default skipAfterMs; settled videos ignore later results; non-Error video rejections", async () => {
    const content = loadContent(
      pkg({
        objects: [],
        actors: [{ id: "hero", scene: "a", entry: null, variants: { default: { animations: { stand: "s" } } } }],
        animations: [{ id: "s", atlas: "x", instructions: [{ op: "frame", n: 0 }, { op: "signal", entity: "hero", name: "breath" }, { op: "wait", frames: 1 }], loop: true }],
      }),
    );
    const clock = new ManualClock();
    const signals: string[] = [];
    const a = new Animator(content, clock, { variantOf: () => "default", signal: (e, n) => signals.push(`${e}:${n}`) });
    a.setAuto("hero", "stand", "left");
    expect(signals).toEqual(["hero:breath"]);
    const cp = new CutscenePlayer(clock, () => new TimelineBackend(clock), { warn: () => {} });
    cp.play("c", { variants: { default: { timeline: [{ atMs: 0 }], durationMs: 5000 } }, skippable: true }, "da", false, () => {});
    clock.advance(999);
    expect(cp.canSkip()).toBe(false);
    clock.advance(1);
    expect(cp.canSkip()).toBe(true);
    const v = new FakeVideo();
    v.playResult = "reject";
    const log: string[] = [];
    const b = new VideoCutsceneBackend({ create: () => v, remove: () => {} }, "/v.webm");
    b.start({ name: "v", choice: { key: "default", variant: { video: "x" }, via: "default" }, hold: false }, { ended: () => log.push("ended"), failed: (m) => log.push(m) });
    v.emit("ended");
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toEqual(["ended"]);
    const w = new FakeVideo();
    w.play = () => Promise.reject("blocked");
    new VideoCutsceneBackend({ create: () => w, remove: () => {} }, "/w.webm").start({ name: "w", choice: { key: "default", variant: { video: "x" }, via: "default" }, hold: false }, { ended: () => {}, failed: (m) => log.push(m) });
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toEqual(["ended", "blocked"]);
  });
});

describe("audio that never comes", () => {
  it("an unavailable backend completes finite sounds with one W-AUDIO-UNAVAILABLE and keeps loops as logical state", () => {
    const content = loadContent(pkg({ scenes: [{ id: "a", entry: null, sounds: { hum: "s.hum", blip: "s.blip" } }], actors: [], objects: [], game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", entry: null }, sounds: [{ id: "s.hum", asset: "h", channel: "ambient" }, { id: "s.blip", asset: "b", channel: "sfx" }] }));
    const warnings: string[] = [];
    const backend: AudioBackend = { locked: true, unavailable: true, start: () => {}, setVolume: () => {}, stop: () => {}, dispose: () => {} };
    const m = new SoundMixer(content, backend, { warn: (c) => warnings.push(c) });
    let done = 0;
    m.play({ entity: "a", name: "blip", times: 1, volume: 1, ownerRun: "r" }, () => done++);
    m.play({ entity: "a", name: "blip", times: 1, volume: 1, ownerRun: "r" }, () => done++);
    m.play({ entity: "a", name: "hum", times: "loop", volume: 1, ownerRun: "r" }, () => done++);
    expect([done, warnings, m.playing().map((p) => p.queued)]).toEqual([2, ["W-AUDIO-UNAVAILABLE"], [true]]);
  });
});
