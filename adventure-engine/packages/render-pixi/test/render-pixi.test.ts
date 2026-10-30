import { loadContent } from "@adventure-engine/content";
import { Engine, type Command } from "@adventure-engine/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { AssetManager } from "../src/assets.ts";
import { clientToLogical, letterbox, logicalToClient } from "../src/letterbox.ts";
import { sceneAssetIds, variantAssetIds } from "../src/scene-assets.ts";

const LOGICAL = { width: 1280, height: 720 };

describe("letterbox transform (spec 06 F2.2)", () => {
  it("fits and centres with bands on the long side", () => {
    expect(letterbox({ width: 1280, height: 720 }, LOGICAL)).toEqual({ scale: 1, offsetX: 0, offsetY: 0, width: 1280, height: 720 });
    expect(letterbox({ width: 1000, height: 1000 }, LOGICAL)).toEqual({ scale: 1000 / 1280, offsetX: 0, offsetY: (1000 - 562.5) / 2, width: 1000, height: 562.5 });
    expect(letterbox({ width: 2000, height: 720 }, LOGICAL)).toMatchObject({ scale: 1, offsetX: 360, offsetY: 0 });
  });

  it("bands and empty containers give no logical point", () => {
    const box = letterbox({ width: 1000, height: 1000 }, LOGICAL);
    expect(clientToLogical([500, 10], box, LOGICAL)).toBeNull();
    expect(clientToLogical([500, 990], box, LOGICAL)).toBeNull();
    expect(clientToLogical([-1, 500], box, LOGICAL)).toBeNull();
    expect(clientToLogical([1001, 500], box, LOGICAL)).toBeNull();
    expect(clientToLogical([0, box.offsetY], box, LOGICAL)).toEqual([0, 0]);
    const none = letterbox({ width: 0, height: 300 }, LOGICAL);
    expect(none.scale).toBe(0);
    expect(letterbox({ width: Number.NaN, height: 300 }, LOGICAL).scale).toBe(0);
    expect(clientToLogical([0, 0], none, LOGICAL)).toBeNull();
    expect(() => letterbox({ width: 10, height: 10 }, { width: 0, height: 720 })).toThrow(RangeError);
  });

  it("points on the far edge survive the round trip despite floating-point round-off", () => {
    for (const size of [{ width: 1000, height: 1000 }, { width: 333, height: 777 }, { width: 1921, height: 1081 }]) {
      const box = letterbox(size, LOGICAL);
      expect(clientToLogical(logicalToClient([1280, 720], box), box, LOGICAL)).toEqual([1280, 720]);
      expect(clientToLogical(logicalToClient([0, 0], box), box, LOGICAL)).toEqual([0, 0]);
    }
  });

  it("property: logical → client → logical is the identity inside the game area", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4000 }),
        fc.integer({ min: 1, max: 4000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (w, h, fx, fy) => {
          const box = letterbox({ width: w, height: h }, LOGICAL);
          const p: [number, number] = [fx * LOGICAL.width, fy * LOGICAL.height];
          const back = clientToLogical(logicalToClient(p, box), box, LOGICAL);
          expect(back).not.toBeNull();
          const [x, y] = back as [number, number];
          expect(Math.abs(x - p[0])).toBeLessThan(1e-6);
          expect(Math.abs(y - p[1])).toBeLessThan(1e-6);
          // The game area never exceeds the container and keeps the aspect ratio.
          expect(box.width).toBeLessThanOrEqual(w + 1e-9);
          expect(box.height).toBeLessThanOrEqual(h + 1e-9);
          expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(1e-9);
        },
      ),
    );
  });
});

interface Deferred {
  resolve: (v: string) => void;
  reject: (e: unknown) => void;
}

function manager(manifest: Record<string, { url: string }>) {
  const calls: string[] = [];
  const pending = new Map<string, Deferred>();
  const warnings: string[] = [];
  const m = new AssetManager<string>({
    manifest,
    loader: (id, url) =>
      new Promise<string>((resolve, reject) => {
        calls.push(url);
        pending.set(id, { resolve, reject });
      }),
    placeholder: (id) => `placeholder:${id}`,
    onWarning: (id, message) => warnings.push(`${id}: ${message}`),
  });
  return { m, calls, pending, warnings };
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("asset manager (spec 06 F8, TS-F08 unit)", () => {
  it("deduplicates in-flight loads, caches results and reports progress", async () => {
    const { m, calls, pending } = manager({ a: { url: "/a.svg" }, b: { url: "/b.svg" } });
    const progress: string[] = [];
    const first = m.load(["a", "b", "a"], (p) => progress.push(`${p.done}/${p.total}`));
    const second = m.load(["a"]);
    expect(m.status("a")).toBe("loading");
    expect(m.get("a")).toBeUndefined();
    expect(calls).toEqual(["/a.svg", "/b.svg"]);
    pending.get("a")?.resolve("tex-a");
    pending.get("b")?.resolve("tex-b");
    await Promise.all([first, second]);
    expect(progress).toEqual(["0/2", "1/2", "2/2"]);
    expect(m.get("a")).toBe("tex-a");
    expect(m.status("b")).toBe("loaded");
    await m.load(["a", "b"]);
    expect(calls).toHaveLength(2);
    expect(m.status("zzz")).toBe("unknown");
  });

  it("failures and unknown ids get a placeholder and one warning each, in request order; load never rejects", async () => {
    const { m, pending, warnings, calls } = manager({ bad: { url: "/bad.svg" }, ok: { url: "/ok.svg" } });
    const p = m.load(["missing", "bad", "ok"]);
    await flush();
    pending.get("ok")?.resolve("tex-ok");
    await flush();
    pending.get("bad")?.reject(new Error("404"));
    await expect(p).resolves.toBeUndefined();
    expect(m.get("bad")).toBe("placeholder:bad");
    expect(m.get("missing")).toBe("placeholder:missing");
    expect(m.status("bad")).toBe("failed");
    expect(warnings).toEqual([
      'missing: asset "missing" could not be loaded (not in the asset manifest); placeholder used',
      'bad: asset "bad" could not be loaded (404); placeholder used',
    ]);
    await m.load(["bad"]);
    expect(warnings).toHaveLength(2);
    m.retry("ok");
    m.retry("bad");
    expect(m.status("bad")).toBe("unknown");
    const again = m.load(["bad"]);
    await flush();
    pending.get("bad")?.reject("still gone");
    await again;
    expect(calls.filter((c) => c === "/bad.svg")).toHaveLength(2);
    expect(warnings.at(-1)).toContain("(still gone)");
  });
});

describe("scene preload set (spec 06 F8.2)", () => {
  const content = loadContent({
    game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", player: { actor: "hero" }, entry: null },
    scenes: [
      { id: "a", entry: null, variants: ["default", "night"], spots: { s: { x: 10, y: 10 } }, defaultSpot: "s", layers: [{ id: "bg", depth: 0, assets: { default: "bg.a", night: "bg.a.night" } }, { id: "fx", depth: 5 }] },
      { id: "b", entry: null, spots: { s: { x: 10, y: 10 } }, defaultSpot: "s", layers: [{ id: "bg", depth: 0, assets: { night: "bg.b.night" } }] },
    ],
    actors: [
      { id: "hero", scene: "a", entry: null, variants: { default: { sprite: "hero", portrait: "hero.face" } } },
      { id: "cat", scene: "b", spot: "s", entry: null, variants: { default: { sprite: "cat" }, wet: { sprite: "cat.wet" } } },
    ],
    objects: [
      { id: "cup", container: { kind: "scene", id: "a" }, spot: "s", entry: null, variants: { default: { sprite: "cup" } } },
      { id: "coin", container: { kind: "actor", id: "hero" }, entry: null, icon: "coin.icon", variants: { default: {} } },
      { id: "pen", container: { kind: "actor", id: "hero" }, entry: null, variants: { default: {} } },
      { id: "far", container: { kind: "scene", id: "b" }, spot: "s", entry: null, variants: { default: {} } },
    ],
  });
  const engine = new Engine(content, { seed: "s", adapter: { onCommand: (_c: Command) => ({ kind: "auto", afterMs: 0 }) } });

  it("current variants of the scene's layers, actors and objects plus the player and its inventory icons", () => {
    expect(sceneAssetIds(content, engine.world, "a")).toEqual(["bg.a", "coin.icon", "cup", "hero", "hero.face"]);
    expect(sceneAssetIds(content, engine.world, "b")).toEqual(["cat", "coin.icon", "hero", "hero.face"]);
    engine.world.setVariant("a", "night");
    expect(sceneAssetIds(content, engine.world, "a")).toContain("bg.a.night");
    expect(sceneAssetIds(content, engine.world, "nowhere")).toEqual(["coin.icon", "hero", "hero.face"]);
    expect(variantAssetIds(content, "cat", "wet")).toEqual(["cat.wet"]);
    expect(variantAssetIds(content, "b", "night")).toEqual(["bg.b.night"]);
    expect(variantAssetIds(content, "ghost", "x")).toEqual([]);
  });
});

describe("scene preload without a player", () => {
  it("collects only the scene's own assets", () => {
    const content = loadContent({
      game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", entry: null },
      scenes: [{ id: "a", entry: null, spots: { s: { x: 10, y: 10 } }, defaultSpot: "s", layers: [{ id: "bg", depth: 0, assets: { default: "bg" } }] }],
      actors: [{ id: "npc", scene: "a", spot: "s", entry: null, variants: { default: { sprite: "npc" } } }],
    });
    const engine = new Engine(content, { seed: "s", adapter: { onCommand: (_c: Command) => ({ kind: "auto", afterMs: 0 }) } });
    expect(engine.world.playerId).toBeNull();
    expect(sceneAssetIds(content, engine.world, "a")).toEqual(["bg", "npc"]);
  });
});
