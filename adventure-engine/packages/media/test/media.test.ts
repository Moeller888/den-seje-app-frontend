import { loadContent, type AnimationDef, type ContentPackage, type CutsceneDef } from "@adventure-engine/content";
import type { Command } from "@adventure-engine/core";
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
  chooseFormat,
  schedulerClock,
  selectCutsceneVariant,
  type MediaWarningCode,
} from "../src/index.ts";

const anim = (id: string, instructions: AnimationDef["instructions"], extra: Partial<AnimationDef> = {}): AnimationDef => ({ id, atlas: "atlas.test", instructions, ...extra });

function player(def: AnimationDef, clock = new ManualClock()) {
  const log: string[] = [];
  const p = new AnimationPlayer(def, clock, {
    onSignal: (e, n) => log.push(`signal:${e}:${n}`),
    onLoop: () => log.push("loop"),
    onDone: () => log.push("done"),
  });
  return { p, clock, log };
}

describe("animation player (spec 06 F3)", () => {
  const wave = anim("wave", [
    { op: "fps", n: 10 },
    { op: "play", from: 0, to: 2 },
    { op: "signal", entity: "owl", name: "hit" },
    { op: "layer", name: "face" },
    { op: "frame", n: 7 },
    { op: "wait", frames: 2 },
    { op: "layerPop" },
    { op: "fps", n: 5 },
    { op: "play", from: 4, to: 3 },
  ]);

  it("plays frames with the current fps, signals exactly once and finishes once", () => {
    const { p, clock, log } = player(wave);
    p.start();
    expect(p.state).toMatchObject({ status: "playing", frame: 0, fps: 10 });
    clock.advance(100);
    expect(p.state.frame).toBe(1);
    clock.advance(200);
    // play 0..2 took 300 ms; the signal fired and the face layer shows frame 7.
    expect(log).toEqual(["signal:owl:hit"]);
    expect(p.state).toMatchObject({ layer: "face", layerStack: ["face"], frames: { "": 2, face: 7 } });
    clock.advance(200);
    // The layer stack is restored by layerPop; fps 5 → 200 ms per frame for the reversed play.
    expect(p.state).toMatchObject({ layer: "", layerStack: [], frame: 4, fps: 5, frames: { face: 7 } });
    clock.advance(199);
    expect(p.state.frame).toBe(4);
    clock.advance(1);
    expect(p.state.frame).toBe(3);
    clock.advance(200);
    expect(log).toEqual(["signal:owl:hit", "done"]);
    expect(p.status).toBe("done");
    clock.advance(10_000);
    expect(log).toHaveLength(2);
    expect(clock.pending).toBe(0);
  });

  it("TS-F03: startAt(i) is silent: the state equals the state just before instruction i, without signals, time or events", () => {
    for (let i = 0; i <= wave.instructions.length; i++) {
      // Reference: the program up to (not including) instruction i, played normally to its end.
      const ref = player({ ...wave, instructions: wave.instructions.slice(0, i) });
      ref.p.start();
      ref.clock.advance(60_000);
      const seeked = AnimationPlayer.stateAt(wave, i);
      expect({ frames: seeked.frames, fps: seeked.fps, layerStack: seeked.layerStack, pc: seeked.pc }, `at ${i}`).toEqual({
        frames: ref.p.state.frames,
        fps: ref.p.state.fps,
        layerStack: ref.p.state.layerStack,
        pc: i,
      });
      // Starting at i plays only the rest: signals before i are never emitted.
      const silent = player(wave);
      silent.p.start({ at: i });
      silent.clock.advance(60_000);
      expect(silent.log.filter((l) => l.startsWith("signal")), `at ${i}`).toEqual(i <= 2 ? ["signal:owl:hit"] : []);
      expect(silent.log.at(-1)).toBe("done");
    }
    expect(AnimationPlayer.stateAt(wave, 99).pc).toBe(wave.instructions.length);
  });

  it("TS-F04: a loopRange program reports the loop at once and keeps animating without finishing", () => {
    const walk = anim("walk", [{ op: "fps", n: 10 }, { op: "frame", n: 9 }, { op: "loopRange", from: 1, to: 3 }]);
    const { p, clock, log } = player(walk);
    p.start();
    expect(log).toEqual(["loop"]);
    expect(p.state).toMatchObject({ status: "looping", frame: 1 });
    const frames: number[] = [];
    for (let k = 0; k < 7; k++) {
      clock.advance(100);
      frames.push(p.state.frame);
    }
    expect(frames).toEqual([2, 3, 1, 2, 3, 1, 2]);
    expect(p.loopPhase()).toBeCloseTo(1 / 3);
    expect(log).toEqual(["loop"]);
    p.stop();
    expect(p.status).toBe("stopped");
    expect(clock.pending).toBe(0);
    expect(p.loopPhase()).toBeNull();
  });

  it("loop: true repeats the whole program (signals every pass) and reports the loop at once", () => {
    const blink = anim("blink", [{ op: "frame", n: 0 }, { op: "wait", frames: 6 }, { op: "signal", entity: "owl", name: "blink" }, { op: "play", from: 1, to: 2 }], { loop: true, defaultFps: 12 });
    const { p, clock, log } = player(blink);
    p.start();
    expect(log).toEqual(["loop"]);
    clock.advance(1000 * (8 / 12) * 3);
    expect(log.filter((l) => l === "signal:owl:blink")).toHaveLength(3);
    expect(() => p.start()).toThrow(/once/);
  });

  it("a timeless endless program cannot spin; loopPhase starts a loop part-way", () => {
    const { p, log } = player(anim("bad", [{ op: "frame", n: 1 }], { loop: true }));
    p.start();
    expect(log).toEqual(["loop", "done"]);
    const { p: q, clock } = player(anim("walk", [{ op: "fps", n: 10 }, { op: "loopRange", from: 4, to: 7 }]));
    q.start({ loopPhase: 0.5 });
    expect(q.state.frame).toBe(6);
    clock.advance(100);
    expect(q.state.frame).toBe(7);
    const { p: r } = player(anim("walk", [{ op: "loopRange", from: 4, to: 7 }]));
    r.start({ loopPhase: -0.25 });
    expect(r.state.frame).toBe(7);
  });
});

const rect = (x: number): Array<[number, number]> => [[x, 600], [x + 50, 600], [x + 50, 700], [x, 700]];

function media(extra: Partial<ContentPackage> = {}) {
  const pkg: ContentPackage = {
    game: { id: "t", version: "1", formatVersion: 1, languages: ["da", "en", "sv"], defaultLanguage: "da", player: { actor: "hero" }, entry: null },
    scenes: [
      {
        id: "hall",
        entry: null,
        spots: { a: { x: 10, y: 650 } },
        defaultSpot: "a",
        walkable: [rect(0)],
        sounds: { hum: "s.hum", music: "s.music" },
        cutscenes: {
          intro: { variants: { da: { timeline: [{ atMs: 0, asset: "img.a" }, { atMs: 500, asset: "img.b" }], durationMs: 2000 }, default: { video: "vid.intro", durationMs: 3000 } }, skippable: true },
          only: { variants: { sv: { timeline: [{ atMs: 0 }], durationMs: 400 } }, hold: true },
        },
      },
      { id: "yard", entry: null, spots: { a: { x: 10, y: 650 } }, defaultSpot: "a" },
    ],
    actors: [
      {
        id: "hero",
        scene: "hall",
        spot: "a",
        entry: null,
        sounds: { step: "s.step" },
        variants: { default: { animations: { "walk.left": "a.walkL", "walk.right": "a.walkR", "stand.right": "a.stand", wave: "a.wave", cannot: "a.cannot", idle: "a.idle" } } },
      },
      { id: "owl", scene: "hall", spot: "a", entry: null, sounds: { hoot: "s.hoot" }, variants: { default: { animations: { flap: "a.flap" } }, wet: {} } },
    ],
    objects: [{ id: "radio", container: { kind: "scene", id: "hall" }, spot: "a", entry: null, sounds: { song: "s.song" }, variants: { default: {} } }],
    animations: [
      anim("a.walkL", [{ op: "fps", n: 10 }, { op: "loopRange", from: 0, to: 3 }]),
      anim("a.walkR", [{ op: "fps", n: 10 }, { op: "loopRange", from: 4, to: 7 }]),
      anim("a.stand", [{ op: "frame", n: 8 }, { op: "wait", frames: 1 }], { loop: true }),
      anim("a.wave", [{ op: "fps", n: 10 }, { op: "play", from: 0, to: 3 }, { op: "signal", entity: "owl", name: "waved" }, { op: "wait", frames: 1 }]),
      anim("a.cannot", [{ op: "play", from: 0, to: 1 }]),
      anim("a.idle", [{ op: "fps", n: 10 }, { op: "frame", n: 1 }, { op: "loopRange", from: 1, to: 2 }]),
      anim("a.flap", [{ op: "fps", n: 10 }, { op: "play", from: 0, to: 9 }], { maxDuration: 500 }),
    ],
    sounds: [
      { id: "s.hum", asset: "snd.hum", channel: "ambient", volume: 0.5, durationMs: 1000 },
      { id: "s.music", asset: "snd.music", channel: "music", durationMs: 4000, persistAcrossScenes: true },
      { id: "s.step", asset: "snd.step", channel: "sfx", durationMs: 100 },
      { id: "s.hoot", asset: "snd.hoot", channel: "sfx", durationMs: 300 },
      { id: "s.song", asset: "snd.song", channel: "music", durationMs: 2000 },
    ],
    i18n: { da: {}, en: {}, sv: {} },
    ...extra,
  };
  return loadContent(pkg, { mode: "lenient" });
}

function presenter(options: { locked?: boolean; scene?: string } = {}) {
  const content = media();
  const clock = new ManualClock();
  const audio = new HeadlessAudioBackend(clock, { locked: options.locked ?? false });
  const replies: string[] = [];
  const signals: string[] = [];
  const warnings: string[] = [];
  const trace: string[] = [];
  const backends: TimelineBackend[] = [];
  const variants = new Map<string, string>();
  const p = new MediaPresenter(
    {
      content,
      clock,
      reply: (id) => replies.push(id),
      signal: (e, n) => signals.push(`${e}:${n}`),
      warn: (code: MediaWarningCode, m) => warnings.push(`${code} ${m}`),
      trace: (e) => trace.push(e),
      variantOf: (e) => variants.get(e) ?? (content.actors.has(e) || content.objects.has(e) ? "default" : null),
      ownerScene: (e) => (e === "hero" ? null : content.scenes.has(e) ? e : "hall"),
      playerScene: () => options.scene ?? "hall",
    },
    {
      audio,
      cutscene: () => {
        const b = new TimelineBackend(clock);
        backends.push(b);
        return b;
      },
    },
  );
  audio.unlockListener = () => p.mixer.unlocked();
  let n = 0;
  const cmd = <T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "cmdId" | "runId" | "nodeId" | "type">, runId = "r1"): Extract<Command, { type: T }> =>
    ({ cmdId: `c${++n}`, runId, nodeId: null, type, ...fields }) as unknown as Extract<Command, { type: T }>;
  return { p, clock, audio, replies, signals, warnings, trace, backends, variants, cmd, content };
}

describe("animator: actions and automatic stand/walk (phase 4)", () => {
  it("falls back from walk.<facing> to stand, keeps the walk phase on a facing change and lets walking end a looping pose", () => {
    const { p, clock } = presenter();
    const a = p.animator;
    a.setAuto("hero", "walk", "left");
    expect(a.view("hero")).toMatchObject({ slot: "auto", name: "walk.left" });
    clock.advance(200);
    expect(a.view("hero")?.player.state.frame).toBe(2);
    a.setAuto("hero", "walk", "left");
    a.setAuto("hero", "walk", "right");
    // Phase 2/4 of the left cycle → frame 4 + 2 of the right cycle.
    expect(a.view("hero")).toMatchObject({ name: "walk.right" });
    expect(a.view("hero")?.player.state.frame).toBe(6);
    a.setAuto("hero", "stand", "right");
    expect(a.view("hero")?.name).toBe("stand.right");
    // talk.<facing> → talk → stand.<facing> → stand: here stand.right.
    a.setAuto("hero", "talk", "right");
    expect(a.view("hero")?.name).toBe("stand.right");
    a.setAuto("hero", "talk", "up");
    expect(a.view("hero")).toBeNull();
    a.setAuto("owl", "stand", "left");
    expect(a.view("owl")).toBeNull();
    a.play("hero", "idle");
    expect(a.view("hero")).toMatchObject({ slot: "action", name: "idle" });
    a.setAuto("hero", "walk", "left");
    expect(a.view("hero")).toMatchObject({ slot: "auto", name: "walk.left" });
    expect(a.play("hero", "nothing")).toBeNull();
    expect(a.entities()).toEqual(["hero", "owl"]);
    a.reset();
    expect(a.entities()).toEqual([]);
    expect(new Animator(media(), clock, { variantOf: () => null, signal: () => {} }).resolve("ghost", "x")).toBeUndefined();
  });

  it("a replaced animation emits no later signals", () => {
    const { p, clock, signals } = presenter();
    p.animator.play("hero", "wave");
    clock.advance(300);
    p.animator.play("hero", "idle");
    clock.advance(5000);
    expect(signals).toEqual([]);
    p.animator.play("hero", "wave");
    clock.advance(5000);
    expect(signals).toEqual(["owl:waved"]);
  });
});

describe("presenter: PlayAnimation replies (TS-F04)", () => {
  it("finite waits for the end; loops answer at once; missing animations complete with a warning", () => {
    const { p, clock, replies, warnings, signals, cmd } = presenter();
    const wave = cmd("PlayAnimation", { entity: "hero", animation: "wave", loop: false });
    expect(p.handle(wave)).toEqual({ kind: "await" });
    clock.advance(399);
    expect(replies).toEqual([]);
    clock.advance(1);
    expect(signals).toEqual(["owl:waved"]);
    clock.advance(100);
    expect(replies).toEqual([wave.cmdId]);
    const idle = cmd("PlayAnimation", { entity: "hero", animation: "idle", loop: false });
    expect(p.handle(idle)).toEqual({ kind: "await" });
    expect(replies).toHaveLength(1);
    clock.advance(0);
    expect(replies).toEqual([wave.cmdId, idle.cmdId]);
    expect(p.pendingCount).toBe(0);
    clock.advance(1000);
    expect(p.animator.view("hero")?.player.status).toBe("looping");
    expect(p.handle(cmd("PlayAnimation", { entity: "hero", animation: "dance", loop: false }))).toEqual({ kind: "auto", afterMs: 0 });
    expect(warnings).toEqual(['W-ANIM-MISSING "hero" has no animation "dance"; nothing is played']);
  });

  it("timeout and cancellation stop the player and nothing is answered later; run-owned loops stop", () => {
    const { p, clock, replies, cmd } = presenter();
    const flap = cmd("PlayAnimation", { entity: "owl", animation: "flap", loop: false, timeoutMs: 500 });
    p.handle(flap);
    clock.advance(500);
    p.onCommandAbandoned(flap, "timeout");
    expect(p.animator.view("owl")).toBeNull();
    clock.advance(5000);
    const idle = cmd("PlayAnimation", { entity: "hero", animation: "idle", loop: false }, "r9");
    p.handle(idle);
    p.onCommandAbandoned(idle, "cancelled");
    clock.advance(10);
    expect(replies).toEqual([]);
    const idle2 = cmd("PlayAnimation", { entity: "hero", animation: "idle", loop: false }, "r9");
    p.handle(idle2);
    clock.advance(0);
    expect(replies).toEqual([idle2.cmdId]);
    p.onRunCancelled("r9");
    expect(p.animator.view("hero")).toBeNull();
    p.onCommandAbandoned(idle2, "cancelled");
  });

  it("React plays the optional cannot animation and leaves the rest to the outer adapter", () => {
    const { p, cmd } = presenter();
    expect(p.handle(cmd("React", { actor: "hero", kind: "cannot" }))).toBeNull();
    expect(p.animator.view("hero")?.name).toBe("cannot");
    expect(p.handle(cmd("React", { actor: "owl", kind: "cannot" }))).toBeNull();
    expect(p.handle(cmd("Say", { speaker: "hero", textKey: "x" }))).toBeNull();
  });
});

describe("sound (spec 06 F4, TS-F04/TS-F05)", () => {
  it("effective volume = master × channel × command × asset; mute keeps and unmute restores the settings", () => {
    const { p, audio, cmd } = presenter();
    p.handle(cmd("PlaySound", { entity: "hall", sound: "hum", times: "loop", volume: 0.8 }));
    const [hum] = p.mixer.playing();
    expect(audio.volumes.get(hum?.id ?? -1)).toBeCloseTo(0.4);
    p.mixer.setMaster(0.5);
    p.mixer.setChannel("ambient", 0.5);
    expect(audio.volumes.get(hum?.id ?? -1)).toBeCloseTo(0.1);
    p.mixer.setMuted(true);
    expect(audio.volumes.get(hum?.id ?? -1)).toBe(0);
    expect([p.mixer.master, p.mixer.channelVolume("ambient"), p.mixer.muted]).toEqual([0.5, 0.5, true]);
    p.mixer.setMuted(false);
    expect(audio.volumes.get(hum?.id ?? -1)).toBeCloseTo(0.1);
    p.mixer.setMaster(7);
    p.mixer.setChannel("ambient", Number.NaN);
    expect([p.mixer.master, p.mixer.channelVolume("ambient")]).toEqual([1, 0]);
    expect(() => p.mixer.setChannel("speech" as never, 1)).toThrow(RangeError);
    expect(p.mixer.effectiveVolume({ sound: { id: "x", asset: "y", channel: "sfx", volume: 2 }, commandVolume: 3 })).toBe(1);
  });

  it("finite sounds answer once after all repetitions; loops answer at once; stop is idempotent with a 500 ms fade", () => {
    const { p, clock, audio, replies, cmd } = presenter();
    const hoot = cmd("PlaySound", { entity: "owl", sound: "hoot", times: 3, volume: 1 });
    expect(p.handle(hoot)).toEqual({ kind: "await" });
    clock.advance(899);
    expect(replies).toEqual([]);
    clock.advance(1);
    expect(replies).toEqual([hoot.cmdId]);
    expect(p.handle(cmd("PlaySound", { entity: "hall", sound: "hum", times: "loop", volume: 1 }))).toEqual({ kind: "auto", afterMs: 0 });
    p.handle(cmd("PlaySound", { entity: "radio", sound: "song", times: "loop", volume: 1 }));
    const ids = p.mixer.playing().map((x) => x.id);
    expect(new Set(ids).size).toBe(2);
    expect(p.handle(cmd("StopSound", { entity: "hall", sound: "hum" }))).toEqual({ kind: "auto", afterMs: 0 });
    expect(audio.fading.get(ids[0] ?? -1)).toBe(500);
    expect(p.mixer.stop("hall", "hum")).toBe(0);
    clock.advance(500);
    expect(audio.fading.size).toBe(0);
    expect(p.mixer.playing().map((x) => x.entity)).toEqual(["radio"]);
  });

  it("TS-F05: leaving a scene fades out its loops but keeps persistent ones and the player's; clean-up is idempotent", () => {
    const { p, audio, cmd } = presenter();
    p.handle(cmd("PlaySound", { entity: "hall", sound: "hum", times: "loop", volume: 1 }));
    p.handle(cmd("PlaySound", { entity: "hall", sound: "music", times: "loop", volume: 1 }));
    p.handle(cmd("PlaySound", { entity: "hero", sound: "step", times: "loop", volume: 1 }));
    p.handle(cmd("PlaySound", { entity: "owl", sound: "hoot", times: "loop", volume: 1 }));
    p.onSceneExit("hall");
    expect(p.mixer.playing().map((x) => `${x.entity}:${x.name}`)).toEqual(["hall:music", "hero:step"]);
    expect([...audio.fading.values()]).toEqual([500, 500]);
    p.onSceneExit("hall");
    expect(p.mixer.playing()).toHaveLength(2);
    expect(p.mixer.stop("hall", "hum")).toBe(0);
  });

  it("cancellation stops loops owned by the cancelled run only", () => {
    const { p, cmd } = presenter();
    p.handle(cmd("PlaySound", { entity: "hall", sound: "hum", times: "loop", volume: 1 }, "r1"));
    p.handle(cmd("PlaySound", { entity: "radio", sound: "song", times: "loop", volume: 1 }, "r2"));
    p.onRunCancelled("r1");
    expect(p.mixer.playing().map((x) => x.ownerRun)).toEqual(["r2"]);
  });

  it("autoplay: before the unlock finite sounds complete with one warning and loops wait; nothing hangs", () => {
    const { p, clock, audio, replies, warnings, cmd } = presenter({ locked: true });
    const a = cmd("PlaySound", { entity: "owl", sound: "hoot", times: 1, volume: 1 });
    const b = cmd("PlaySound", { entity: "owl", sound: "hoot", times: 1, volume: 1 });
    p.handle(a);
    p.handle(b);
    p.handle(cmd("PlaySound", { entity: "hall", sound: "hum", times: "loop", volume: 1 }));
    clock.advance(0);
    expect(replies).toEqual([a.cmdId, b.cmdId]);
    expect(warnings.filter((w) => w.startsWith("W-AUDIO-LOCKED"))).toHaveLength(1);
    expect(warnings.some((w) => w.startsWith("W-AUDIO-UNAVAILABLE"))).toBe(false);
    expect(p.mixer.playing().map((x) => x.queued)).toEqual([true]);
    expect(audio.volumes.size).toBe(0);
    audio.unlock();
    expect(p.mixer.playing().map((x) => x.queued)).toEqual([false]);
    expect(audio.volumes.size).toBe(1);
  });

  it("unknown sounds and decode failures warn and complete; abandoned finite sounds stop; reset and dispose release everything", () => {
    const { p, clock, audio, replies, warnings, cmd } = presenter();
    const x = cmd("PlaySound", { entity: "owl", sound: "nope", times: 1, volume: 1 });
    p.handle(x);
    audio.failing.add("snd.step");
    const y = cmd("PlaySound", { entity: "hero", sound: "step", times: 2, volume: 1 });
    p.handle(y);
    clock.advance(0);
    expect(replies).toEqual([x.cmdId, y.cmdId]);
    expect(warnings.map((w) => w.slice(0, 12))).toEqual(["W-AUDIO-LOAD", "W-AUDIO-LOAD"]);
    const z = cmd("PlaySound", { entity: "owl", sound: "hoot", times: 1, volume: 1 });
    p.handle(z);
    p.onCommandAbandoned(z, "cancelled");
    clock.advance(1000);
    expect(replies).toHaveLength(2);
    p.handle(cmd("PlaySound", { entity: "hall", sound: "hum", times: "loop", volume: 1 }));
    p.handle(cmd("PlayCutscene", { cutscene: "intro", language: "da", hold: false }));
    p.handle(cmd("PlayAnimation", { entity: "hero", animation: "wave", loop: false }));
    p.dispose();
    expect(p.mixer.playing()).toEqual([]);
    expect(p.cutscenes.state).toBe("idle");
    expect(p.animator.entities()).toEqual([]);
    expect(clock.pending).toBe(0);
    expect(p.handle(cmd("PlaySound", { entity: "owl", sound: "hoot", times: 1, volume: 1 }))).toBeNull();
  });
});

describe("cutscenes (spec 06 F6, TS-F06)", () => {
  const def: CutsceneDef = { variants: { en: { timeline: [{ atMs: 0 }], durationMs: 100 }, default: { timeline: [{ atMs: 0 }], durationMs: 100 } } };

  it("TS-F06: current language → default → first variant with a warning", () => {
    expect(selectCutsceneVariant(def, "en")).toMatchObject({ key: "en", via: "language" });
    expect(selectCutsceneVariant(def, "da")).toMatchObject({ key: "default", via: "default" });
    expect(selectCutsceneVariant({ variants: { sv: { video: "v" }, fi: { video: "w" } } }, "da")).toMatchObject({ key: "sv", via: "first" });
    expect(selectCutsceneVariant({ variants: {} }, "da")).toBeNull();
    const { p, clock, replies, warnings, cmd } = presenter();
    const c = cmd("PlayCutscene", { cutscene: "only", language: "da", hold: false });
    p.handle(c);
    expect(warnings).toEqual(['W-CUTSCENE-LANG cutscene "only" has no "da" or "default" variant; using "sv"']);
    expect(p.cutscenes.variant).toBe("sv");
    clock.advance(400);
    expect(replies).toEqual([c.cmdId]);
    // `only` holds by default.
    expect(p.cutscenes.state).toBe("held");
  });

  it("skip is ignored before skipAfterMs and honoured after; the result answers once", () => {
    const { p, clock, replies, cmd, backends } = presenter();
    const c = cmd("PlayCutscene", { cutscene: "intro", language: "en", hold: false });
    p.handle(c);
    expect(p.cutscenes.variant).toBe("default");
    clock.advance(999);
    expect(p.skipCutscene()).toBe(false);
    expect(p.cutscenes.state).toBe("playing");
    clock.advance(1);
    expect(p.skipCutscene()).toBe(true);
    expect(p.cutscenes.state).toBe("idle");
    expect(backends[0]?.visible).toBe(false);
    clock.advance(5000);
    expect(replies).toEqual([c.cmdId]);
    expect(p.skipCutscene()).toBe(false);
  });

  it("hold keeps the last picture until the next cutscene or a clear; not skippable ignores skip; failure and cancellation", () => {
    const { p, clock, replies, warnings, cmd, backends } = presenter();
    const c1 = cmd("PlayCutscene", { cutscene: "intro", language: "da", hold: true });
    p.handle(c1);
    clock.advance(600);
    expect(backends[0]?.frameIndex).toBe(1);
    clock.advance(1400);
    expect(p.cutscenes.state).toBe("held");
    expect(backends[0]).toMatchObject({ visible: true, frameIndex: 1, playing: false });
    const c2 = cmd("PlayCutscene", { cutscene: "only", language: "sv", hold: true });
    p.handle(c2);
    expect(backends[0]?.visible).toBe(false);
    expect(p.skipCutscene()).toBe(false);
    clock.advance(400);
    expect(p.handle(cmd("ClearCutscene", {}))).toEqual({ kind: "auto", afterMs: 0 });
    expect(p.cutscenes.state).toBe("idle");
    expect(backends[1]?.visible).toBe(false);
    // A video variant without duration fails headless: warning, done, nothing held.
    const content = media();
    const cp = new CutscenePlayer(clock, () => new TimelineBackend(clock), { warn: (c, m) => warnings.push(`${c} ${m}`) });
    let done = 0;
    cp.play("v", { variants: { default: { video: "x" } } }, "da", true, () => done++);
    clock.advance(0);
    expect([done, cp.state, warnings.at(-1)]).toEqual([1, "idle", 'W-CUTSCENE-FAILED cutscene "v" failed: no durationMs for headless playback']);
    cp.play("e", { variants: {} }, "da", false, () => done++);
    expect(done).toBe(2);
    const c3 = cmd("PlayCutscene", { cutscene: "intro", language: "da", hold: false });
    p.handle(c3);
    p.onCommandAbandoned(c3, "cancelled");
    clock.advance(5000);
    expect(replies).toEqual([c1.cmdId, c2.cmdId]);
    expect(p.handle(cmd("PlayCutscene", { cutscene: "missing", language: "da", hold: false }))).toEqual({ kind: "auto", afterMs: 0 });
    expect(presenter({ scene: "yard" }).p.handle(cmd("PlayCutscene", { cutscene: "intro", language: "da", hold: false }))).toEqual({ kind: "auto", afterMs: 0 });
    expect(content.scenes.size).toBe(2);
  });

  it("reset removes held cutscenes, animations and sounds", () => {
    const { p, clock, cmd } = presenter();
    p.handle(cmd("PlayCutscene", { cutscene: "only", language: "sv", hold: true }));
    clock.advance(400);
    p.handle(cmd("PlaySound", { entity: "hall", sound: "music", times: "loop", volume: 1 }));
    p.animator.setAuto("hero", "walk", "left");
    p.onReset();
    expect([p.cutscenes.state, p.mixer.playing().length, p.animator.entities().length]).toEqual(["idle", 0, 0]);
  });
});

describe("cache and formats (spec 06 F8)", () => {
  it("LRU within the byte budget; pinned and in-use entries survive; eviction releases", () => {
    const released: string[] = [];
    const c = new LruCache<string>(100, (k) => released.push(k));
    c.put("a", "A", 40);
    c.put("b", "B", 40);
    expect(c.get("a")).toBe("A");
    c.put("c", "C", 40);
    // b is the least recently used entry.
    expect(released).toEqual(["b"]);
    c.pin(["a"]);
    c.acquire("c");
    expect(c.isPinned("a")).toBe(true);
    // Nothing else may go, so the new entry itself is not kept.
    c.put("d", "D", 50);
    expect(released).toEqual(["b", "d"]);
    expect(c.stats).toEqual({ bytes: 80, entries: 2, evictions: 2 });
    c.acquire("c");
    c.release("c");
    c.pin([]);
    c.put("e", "E", 30);
    // a is now the oldest unpinned entry; c is still in use (acquired twice, released once).
    expect(released).toEqual(["b", "d", "a"]);
    c.release("c");
    c.put("e", "E2", -5);
    expect(released).toEqual(["b", "d", "a", "e"]);
    expect(c.get("zz")).toBeUndefined();
    c.clear();
    expect(released.slice(-2).sort()).toEqual(["c", "e"]);
    expect(c.stats).toMatchObject({ bytes: 0, entries: 0 });
    expect(() => new LruCache(-1, () => {})).toThrow(RangeError);
  });

  it("the first playable format wins; untyped formats and url are fallbacks", () => {
    const entry = { kind: "audio" as const, formats: [{ url: "a.ogg", type: "audio/ogg" }, { url: "a.wav", type: "audio/wav", bytes: 9 }], url: "a.bin", bytes: 3 };
    expect(chooseFormat(entry, (t) => t === "audio/wav")).toEqual({ url: "a.wav", type: "audio/wav", bytes: 9 });
    expect(chooseFormat(entry, () => false)).toEqual({ url: "a.bin", type: null, bytes: 3 });
    expect(chooseFormat({ formats: [{ url: "x.mp4" }] }, () => false)).toEqual({ url: "x.mp4", type: null, bytes: 0 });
    expect(chooseFormat({ formats: [{ url: "x.mp4", type: "video/mp4" }] }, () => false)).toBeNull();
  });

  it("schedulerClock adapts the engine scheduler", () => {
    const calls: string[] = [];
    const sched = { now: 5, setTimer: (ms: number) => (calls.push(`set ${ms}`), 7), clearTimer: (id: number) => void calls.push(`clear ${id}`) };
    const c = schedulerClock(sched);
    expect(c.now()).toBe(5);
    expect(c.setTimer(3, () => {})).toBe(7);
    c.clearTimer(7);
    expect(calls).toEqual(["set 3", "clear 7"]);
    const m = new SoundMixer(media(), new HeadlessAudioBackend(new ManualClock()), { warn: () => {} });
    expect(m.resolve("radio", "song")?.id).toBe("s.song");
    expect(m.resolve("hall", "s.step")?.id).toBe("s.step");
  });
});
