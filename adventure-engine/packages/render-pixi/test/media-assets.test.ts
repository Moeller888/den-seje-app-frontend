import { loadContent } from "@adventure-engine/content";
import { Engine } from "@adventure-engine/core";
import { describe, expect, it } from "vitest";
import { AssetManager } from "../src/assets.ts";
import { sceneAssetIds, sceneAudioIds, variantAssetIds } from "../src/scene-assets.ts";

describe("asset manager with a byte budget (spec 06 F8.3, phase 4)", () => {
  it("evicts least recently used, keeps pinned and acquired assets, releases evicted values", async () => {
    const released: string[] = [];
    const sizes: Record<string, number> = { a: 40, b: 40, c: 40, d: 40 };
    const m = new AssetManager<string>({
      manifest: { a: { url: "/a" }, b: { url: "/b" }, c: { url: "/c" }, d: { url: "/d" } },
      loader: async (id) => `tex-${id}`,
      placeholder: (id) => `ph-${id}`,
      onWarning: () => {},
      cache: { budgetBytes: 100, bytes: (id) => sizes[id] ?? 0, release: (id, v) => void released.push(`${id}:${v}`) },
    });
    m.pin(["a"]);
    await m.load(["a", "b"]);
    m.acquire("b");
    await m.load(["c"]);
    // a is pinned, b in use: the new entry c cannot be kept.
    expect(released).toEqual(["c:tex-c"]);
    expect(m.get("c")).toBeUndefined();
    expect(m.status("c")).toBe("unknown");
    m.release("b");
    m.pin([]);
    expect(m.get("a")).toBe("tex-a");
    await m.load(["d"]);
    // b is now the least recently used entry.
    expect(released).toEqual(["c:tex-c", "b:tex-b"]);
    await m.load(["c"]);
    expect(m.get("c")).toBe("tex-c");
    m.clear();
    expect(released.slice(2).sort()).toEqual(["a:tex-a", "c:tex-c", "d:tex-d"]);
    expect(m.get("a")).toBeUndefined();
    const plain = new AssetManager<string>({ manifest: {}, loader: async () => "", placeholder: () => "p", onWarning: () => {} });
    plain.pin(["x"]);
    plain.acquire("x");
    plain.release("x");
    plain.clear();
  });
});

describe("media preload sets (spec 06 F8.2, phase 4)", () => {
  const content = loadContent({
    game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", player: { actor: "hero" }, entry: null },
    scenes: [
      {
        id: "a",
        entry: null,
        spots: { s: { x: 1, y: 1 } },
        defaultSpot: "s",
        sounds: { hum: "s.hum", gone: "s.missing" },
        cutscenes: { c: { variants: { da: { timeline: [{ atMs: 0, asset: "img.c1" }, { atMs: 5, textKey: "k" }], durationMs: 10 }, default: { video: "vid" } } } },
      },
      { id: "b", entry: null, spots: { s: { x: 1, y: 1 } }, defaultSpot: "s" },
    ],
    actors: [
      { id: "hero", scene: "a", entry: null, sounds: { step: "s.step" }, variants: { default: { sprite: "hero", animations: { walk: "an.walk", gone: "an.missing" } }, sad: { animations: { cry: "an.cry" } } } },
      { id: "npc", scene: "b", entry: null, sounds: { hey: "s.hey" }, variants: { default: {} } },
    ],
    objects: [
      { id: "radio", container: { kind: "scene", id: "a" }, spot: "s", entry: null, sounds: { song: "s.song" }, variants: { default: {} } },
      { id: "bell", container: { kind: "actor", id: "hero" }, entry: null, sounds: { ring: "s.ring" }, variants: { default: {} } },
      { id: "far", container: { kind: "scene", id: "b" }, spot: "s", entry: null, sounds: { x: "s.far" }, variants: { default: {} } },
      { id: "lost", container: { kind: "none" }, entry: null, sounds: { y: "s.lost" }, variants: { default: {} } },
    ],
    animations: [
      { id: "an.walk", atlas: "atlas.hero", instructions: [{ op: "loopRange", from: 0, to: 1 }] },
      { id: "an.cry", atlas: "atlas.sad", instructions: [{ op: "frame", n: 0 }] },
    ],
    sounds: [
      { id: "s.hum", asset: "snd.hum", channel: "ambient" },
      { id: "s.step", asset: "snd.step", channel: "sfx" },
      { id: "s.hey", asset: "snd.hey", channel: "voice" },
      { id: "s.song", asset: "snd.song", channel: "music" },
      { id: "s.ring", asset: "snd.ring", channel: "sfx" },
      { id: "s.far", asset: "snd.far", channel: "sfx" },
      { id: "s.lost", asset: "snd.lost", channel: "sfx" },
    ],
    i18n: { da: { k: "x" } },
  }, { mode: "lenient" });
  const engine = new Engine(content, { seed: "s", adapter: { onCommand: () => ({ kind: "auto", afterMs: 0 }) } });

  it("pictures include animation atlases of the current variants and the scene's cutscene frames", () => {
    expect(sceneAssetIds(content, engine.world, "a")).toEqual(["atlas.hero", "hero", "img.c1"]);
    expect(variantAssetIds(content, "hero", "sad")).toEqual(["atlas.sad"]);
  });

  it("audio includes the scene, the entities in it, the player and what the player carries", () => {
    expect(sceneAudioIds(content, engine.world, "a")).toEqual(["snd.hum", "snd.ring", "snd.song", "snd.step"]);
    expect(sceneAudioIds(content, engine.world, "b")).toEqual(["snd.far", "snd.hey", "snd.ring", "snd.step"]);
    expect(sceneAudioIds(content, engine.world, "nowhere")).toEqual(["snd.ring", "snd.step"]);
  });
});

describe("media preload sets without sounds", () => {
  it("a package without sound definitions has no audio to preload", () => {
    const content = loadContent({
      game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", player: { actor: "hero" }, entry: null },
      scenes: [{ id: "a", entry: null, sounds: { hum: "s.hum" } }],
      actors: [{ id: "hero", scene: "a", entry: null, variants: { default: {} } }],
    }, { mode: "lenient" });
    const engine = new Engine(content, { seed: "s", adapter: { onCommand: () => ({ kind: "auto", afterMs: 0 }) } });
    expect(sceneAudioIds(content, engine.world, "a")).toEqual([]);
  });
});
