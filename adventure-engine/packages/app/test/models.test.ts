import { loadContent } from "@adventure-engine/content";
import { Engine } from "@adventure-engine/core";
import { describe, expect, it } from "vitest";
import { demoContent } from "../src/demo/content.ts";
import { demoManifest } from "../src/demo/manifest.ts";
import { ChoiceMenuModel, confirmsSay } from "../src/model/choice-menu.ts";
import { cursorView } from "../src/model/cursor.ts";
import { sceneHotspots } from "../src/model/hotspots.ts";
import { format, readSettings } from "../src/model/settings.ts";
import { placeBubble, regionOf } from "../src/model/speech.ts";

describe("choice menu keyboard model (spec 04 D6.4, TS-D11)", () => {
  it("arrows wrap, Home/End jump, Enter/Space choose, digits choose directly", () => {
    const m = new ChoiceMenuModel(3);
    expect(m.key("ArrowDown")).toEqual({ kind: "move", index: 1 });
    expect(m.key("ArrowRight")).toEqual({ kind: "move", index: 2 });
    expect(m.key("ArrowDown")).toEqual({ kind: "move", index: 0 });
    expect(m.key("ArrowUp")).toEqual({ kind: "move", index: 2 });
    expect(m.key("ArrowLeft")).toEqual({ kind: "move", index: 1 });
    expect(m.key("Enter")).toEqual({ kind: "choose", index: 1 });
    expect(m.key("Home")).toEqual({ kind: "move", index: 0 });
    expect(m.key("End")).toEqual({ kind: "move", index: 2 });
    expect(m.key(" ")).toEqual({ kind: "choose", index: 2 });
    expect(m.key("3")).toEqual({ kind: "choose", index: 2 });
    expect(m.key("4")).toBeNull();
    expect(m.key("0")).toBeNull();
    expect(m.key("a")).toBeNull();
    m.hover(0);
    expect(m.index).toBe(0);
    m.hover(7);
    m.hover(1.5);
    expect(m.index).toBe(0);
    expect(() => new ChoiceMenuModel(0)).toThrow(RangeError);
    expect([confirmsSay("Enter"), confirmsSay(" "), confirmsSay("Escape")]).toEqual([true, true, false]);
  });
});

describe("speech bubble placement (spec 06 F5, TS-D12)", () => {
  const base = { feet: [600, 650] as const, speakerHeight: 170, scrollX: 0, bubble: { width: 300, height: 100 }, viewport: { width: 1280, height: 720 } };

  it("uses a valid speech region, else the head, else the centre; always inside the viewport", () => {
    expect(placeBubble({ ...base, region: { x: 500, y: 100, width: 400, height: 120 } })).toEqual({ x: 550, y: 110, source: "region" });
    expect(placeBubble({ ...base, region: undefined })).toEqual({ x: 450, y: 650 - 170 - 16 - 100, source: "head" });
    expect(placeBubble({ ...base, region: undefined, feet: [10, 650] })).toMatchObject({ x: 8, source: "head" });
    expect(placeBubble({ ...base, region: undefined, feet: [1270, 650] })).toMatchObject({ x: 1280 - 300 - 8 });
    expect(placeBubble({ ...base, region: undefined, feet: [600, 90] })).toMatchObject({ y: 8 });
    expect(placeBubble({ ...base, region: undefined, feet: [1400, 650], scrollX: 320 })).toMatchObject({ x: 1400 - 320 - 150 });
    expect(placeBubble({ ...base, region: undefined, feet: null })).toEqual({ x: 490, y: 32, source: "centre" });
    expect(placeBubble({ ...base, region: { x: 0, y: 700, width: 100, height: 100 }, bottomInset: 24 })).toMatchObject({ y: 720 - 24 - 100 - 8 });
  });

  it("malformed regions are ignored", () => {
    expect(regionOf(null)).toBeNull();
    expect(regionOf("x")).toBeNull();
    expect(regionOf({ x: 1, y: 2, width: 3 })).toBeNull();
    expect(regionOf({ x: 1, y: 2, width: 0, height: 3 })).toBeNull();
    expect(regionOf({ x: Number.NaN, y: 2, width: 3, height: 3 })).toBeNull();
    expect(regionOf({ x: 1, y: 2, width: 3, height: 4 })).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });
});

describe("settings and formatting", () => {
  const env = { dev: false, prefersReducedMotion: false };
  it("reads URL flags defensively", () => {
    expect(readSettings("", env, ["da", "en"])).toEqual({ language: null, reducedMotion: false, dev: false, zones: false, seed: "demo" });
    expect(readSettings("?lang=en&motion=off&dev=1&zones=1&seed=x", env, ["da", "en"])).toEqual({ language: "en", reducedMotion: true, dev: true, zones: true, seed: "x" });
    expect(readSettings("?lang=fr&zones=1&seed=", env, ["da", "en"])).toMatchObject({ language: null, zones: false, seed: "demo" });
    expect(readSettings("", { dev: true, prefersReducedMotion: true }, ["da"])).toMatchObject({ dev: true, reducedMotion: true });
  });

  it("format replaces known placeholders and keeps unknown ones visible", () => {
    expect(format("Brug {item} på {target}", { item: "Kande", target: "Ur" })).toBe("Brug Kande på Ur");
    expect(format("{item} {nope}", { item: "x" })).toBe("x {nope}");
  });

  it("the demo manifest maps every asset id the content uses", () => {
    const manifest = demoManifest("/base/");
    const ids = new Set<string>();
    for (const s of demoContent.scenes ?? []) for (const l of s.layers ?? []) for (const a of Object.values(l.assets ?? {})) ids.add(a);
    for (const e of [...(demoContent.actors ?? []), ...(demoContent.objects ?? [])]) for (const v of Object.values(e.variants)) if (v.sprite !== undefined) ids.add(v.sprite);
    for (const o of demoContent.objects ?? []) if (o.icon !== undefined) ids.add(o.icon);
    for (const id of ids) expect(manifest[id]?.url, id).toMatch(/^\/base\/assets\/.+\.svg$/);
  });
});

describe("cursor view (spec 04 D1/D8)", () => {
  const names = (id: string): string | null => (id === "can" ? "o.can" : null);
  it("maps engine cursors to what is shown", () => {
    expect(cursorView({ mode: "busy" }, names)).toEqual({ mode: "busy", item: null, tooltipKey: null, useItemKey: null });
    expect(cursorView({ mode: "walk", point: [1, 2] }, names)).toMatchObject({ mode: "walk", tooltipKey: null });
    expect(cursorView({ mode: "idle" }, names)).toMatchObject({ mode: "idle", tooltipKey: null });
    expect(cursorView({ mode: "idle", tooltipKey: "o.x" }, names)).toMatchObject({ tooltipKey: "o.x" });
    expect(cursorView({ mode: "interact", target: "x", tooltipKey: "o.x" }, names)).toMatchObject({ mode: "interact", tooltipKey: "o.x" });
    expect(cursorView({ mode: "use", item: "can", target: "clock", targetKind: "object", tooltipKey: "o.clock" }, names)).toEqual({
      mode: "use",
      item: "can",
      tooltipKey: "o.clock",
      useItemKey: "o.can",
    });
    expect(cursorView({ mode: "use", item: "can", target: null, targetKind: null, tooltipKey: null }, names)).toMatchObject({ tooltipKey: null });
  });
});

describe("hotspot list (accessibility)", () => {
  it("lists present objects, other actors and portals of the scene in hover order", () => {
    const content = loadContent(demoContent);
    const engine = new Engine(content, { seed: "s", adapter: { onCommand: () => ({ kind: "auto", afterMs: 0 }) } });
    expect(sceneHotspots(content, engine.world, "workroom").map((h) => h.key)).toEqual(["object:clock", "object:oilcan", "portal:to_yard"]);
    expect(sceneHotspots(content, engine.world, "yard").map((h) => [h.key, h.nameKey])).toEqual([
      ["object:feather", "o.feather"],
      ["actor:crow", "a.crow"],
      ["portal:to_workroom", "p.to_workroom"],
    ]);
    engine.world.moveObject("oilcan", { kind: "actor", id: "tove" }, null);
    engine.world.setPortalLocked("to_yard", true);
    expect(sceneHotspots(content, engine.world, "workroom")).toEqual([
      { key: "object:clock", kind: "object", target: { objectZone: "clock" }, nameKey: "o.clock", locked: false },
      { key: "portal:to_yard", kind: "portal", target: { portal: "to_yard" }, nameKey: "p.to_yard", locked: true },
    ]);
    expect(sceneHotspots(content, engine.world, "nowhere")).toEqual([]);
  });
});

describe("hotspot list edge cases", () => {
  it("variants, the player, duplicates, explicit names, actors in object zones, portals without zones, locked texts", () => {
    const rect = (x: number): Array<[number, number]> => [[x, 600], [x + 10, 600], [x + 10, 610], [x, 610]];
    const content = loadContent(
      {
        game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", player: { actor: "me" }, entry: null },
        scenes: [
          {
            id: "s",
            entry: null,
            spots: { a: { x: 5, y: 605 } },
            defaultSpot: "a",
            objectZones: [
              { entity: "box", variant: "open", polygon: rect(0) },
              { entity: "box", nameKey: "z.box", polygon: rect(20) },
              { entity: "box", polygon: rect(40) },
              { entity: "pal", polygon: rect(60) },
              { entity: "nameless", polygon: rect(80) },
            ],
            actorZones: [{ actor: "me", polygon: rect(100) }, { actor: "pal", variant: "sad", polygon: rect(120) }, { actor: "anon", polygon: rect(140) }],
          },
          { id: "t", entry: null, spots: { a: { x: 1, y: 1 } }, defaultSpot: "a" },
        ],
        actors: [
          { id: "me", scene: "s", entry: null, variants: { default: {} } },
          { id: "pal", nameKey: "a.pal", scene: "s", entry: null, variants: { default: {}, sad: {} } },
          { id: "anon", scene: "s", entry: null, variants: { default: {} } },
        ],
        objects: [
          { id: "box", container: { kind: "scene", id: "s" }, entry: null, variants: { default: {}, open: {} } },
          { id: "nameless", container: { kind: "scene", id: "s" }, entry: null, variants: { default: {} } },
        ],
        portals: [
          { id: "p1", from: "s", to: "t", entry: null, nameKey: "p.go", lockedKey: "p.locked", polygon: rect(200) },
          { id: "p2", from: "s", to: "t", index: 1, entry: null, arrivalSpot: "a" },
          { id: "p3", from: "s", to: "t", index: 2, entry: null, arrivalSpot: "a", nameKey: "p.three", polygon: rect(220) },
          { id: "p4", from: "s", to: "t", index: 3, entry: null, arrivalSpot: "a", polygon: rect(240) },
          { id: "back", from: "t", to: "s", entry: null },
        ],
      },
      { mode: "lenient" },
    );
    const engine = new Engine(content, { seed: "s", adapter: { onCommand: () => ({ kind: "auto", afterMs: 0 }) } });
    engine.world.setPortalLocked("p1", true);
    engine.world.setPortalLocked("p3", true);
    expect(sceneHotspots(content, engine.world, "s").map((h) => [h.key, h.nameKey, h.locked])).toEqual([
      ["object:box", "z.box", false],
      ["object:pal", "a.pal", false],
      ["object:nameless", null, false],
      ["actor:anon", null, false],
      ["portal:p1", "p.locked", true],
      ["portal:p3", "p.three", true],
      ["portal:p4", null, false],
    ]);
    const noPortals = loadContent({ ...content.pkg, portals: undefined } as never, { mode: "lenient" });
    expect(sceneHotspots(noPortals, engine.world, "s").map((h) => h.key)).not.toContain("portal:p1");
  });
});
