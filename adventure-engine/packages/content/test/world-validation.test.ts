import { describe, expect, it } from "vitest";
import { ContentValidationError, loadContent, type ContentPackage, type SceneDef } from "../src/index.ts";

const rect = (x: number, y: number, w: number, h: number): Array<[number, number]> => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

function pkg(scene: Partial<SceneDef> = {}, extra: Partial<ContentPackage> = {}): ContentPackage {
  return {
    game: { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", player: { actor: "hero" }, entry: null },
    scenes: [
      { id: "yard", entry: null, spots: { a: { x: 100, y: 600 }, out: { x: 1200, y: 600 } }, defaultSpot: "a", walkable: [rect(0, 500, 1280, 220)], ...scene },
      { id: "hall", entry: null, spots: { d: { x: 100, y: 600 } }, defaultSpot: "d" },
    ],
    actors: [{ id: "hero", scene: "yard", entry: null, variants: { default: {} } }],
    portals: extra.portals ?? [
      { id: "y_h", from: "yard", to: "hall", entry: null, exitSpot: "out", entrySpot: "d" },
      { id: "h_y", from: "hall", to: "yard", entry: null, exitSpot: "d" },
    ],
    i18n: { da: { n: "x" } },
    ...(extra.game !== undefined ? { game: extra.game } : {}),
  };
}

function diagnostics(p: unknown): Array<{ code: string; level: string; path: string }> {
  try {
    return loadContent(p, { mode: "lenient" }).diagnostics.map(({ code, level, path }) => ({ code, level, path }));
  } catch (e) {
    if (e instanceof ContentValidationError) return e.diagnostics.map(({ code, level, path }) => ({ code, level, path }));
    throw e;
  }
}

const has = (p: unknown, code: string, path?: string): boolean => diagnostics(p).some((d) => d.code === code && (path === undefined || d.path === path));

describe("phase-2 world validation (spec 03, 07 §3/§8)", () => {
  it("a valid world package loads in strict mode", () => {
    expect(() => loadContent(pkg({ camera: { focal: 900, height: 170, tilt: 12, horizon: 0.35, speed: 120 } }))).not.toThrow();
  });

  it("E-SCENE-SIZE, E-VIEWPORT, E-CAMERA, E-NUMBER", () => {
    expect(has(pkg({ size: { width: 0, height: 720 } }), "E-SCENE-SIZE", "scenes[0].size")).toBe(true);
    const game = { id: "t", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", player: { actor: "hero" }, entry: null, viewport: { width: -1, height: 720 } };
    expect(has(pkg({}, { game }), "E-VIEWPORT", "game.viewport")).toBe(true);
    const cam = diagnostics(pkg({ camera: { focal: 0, height: 170, tilt: 95, horizon: 0.35, speed: 0 } })).filter((d) => d.code === "E-CAMERA").map((d) => d.path);
    expect(cam).toEqual(["scenes[0].camera.focal", "scenes[0].camera.tilt", "scenes[0].camera.speed"]);
    expect(has(pkg({ camera: 5 as never }), "E-CAMERA")).toBe(true);
    expect(has(pkg({ walkSpeed: -3 }), "E-NUMBER", "scenes[0].walkSpeed")).toBe(true);
    const actors = pkg();
    const bad = { ...actors, actors: [{ id: "hero", scene: "yard", entry: null, variants: { default: {} }, referenceHeight: 0, hitBox: { width: 0, height: 1 } }] };
    expect(diagnostics(bad).filter((d) => d.code === "E-NUMBER").map((d) => d.path)).toEqual(["actors[0].referenceHeight", "actors[0].hitBox"]);
  });

  it("E-SPOT: non-finite, outside the scene, bad height", () => {
    const d = diagnostics(pkg({ spots: { a: { x: 100, y: 600 }, out: { x: 1200, y: 600 }, nan: { x: Number.NaN, y: 1 }, far: { x: 5000, y: 10 }, tall: { x: 1, y: 1, height: -5 } } }));
    expect(d.filter((x) => x.code === "E-SPOT").map((x) => x.path)).toEqual(["scenes[0].spots.nan", "scenes[0].spots.far", "scenes[0].spots.tall.height"]);
    // The scene size defaults to the viewport.
    expect(has(pkg({ size: { width: 6000, height: 720 }, spots: { a: { x: 100, y: 600 }, out: { x: 5000, y: 600 } } }), "E-SPOT")).toBe(false);
  });

  it("E-PORTAL-SELF and E-PORTAL-DUP", () => {
    expect(has(pkg({}, { portals: [{ id: "loop", from: "yard", to: "yard", entry: null }] }), "E-PORTAL-SELF", "portals[0]")).toBe(true);
    const dup = pkg({}, {
      portals: [
        { id: "a", from: "yard", to: "hall", entry: null },
        { id: "b", from: "yard", to: "hall", index: 0, entry: null },
        { id: "c", from: "hall", to: "yard", entry: null },
      ],
    });
    expect(has(dup, "E-PORTAL-DUP", "portals[1]")).toBe(true);
    expect(has(dup, "E-PORTAL-DUP", "portals[0]")).toBe(false);
  });

  it("W-SPOT-UNWALKABLE for walk targets outside the area or above the horizon", () => {
    const off = pkg({ spots: { a: { x: 100, y: 100 }, out: { x: 1200, y: 600 } } });
    expect(diagnostics(off).filter((d) => d.code === "W-SPOT-UNWALKABLE").map((d) => d.path)).toEqual(["scenes[0].defaultSpot"]);
    const cam = pkg({ camera: { focal: 900, height: 170, tilt: 12, horizon: 0.35, speed: 120 }, walkable: [rect(0, 0, 1280, 720)], spots: { a: { x: 100, y: 20 }, out: { x: 1200, y: 600 } } });
    expect(diagnostics(cam).some((d) => d.code === "W-SPOT-UNWALKABLE" && d.path === "scenes[0].defaultSpot")).toBe(true);
    expect(diagnostics(cam).find((d) => d.code === "W-SPOT-UNWALKABLE")?.level).toBe("warning");
  });

  it("duplicate trigger zone ids and overlapping portal zones", () => {
    expect(has(pkg({ triggerZones: [{ id: "z", entry: null, polygon: rect(0, 500, 10, 10) }, { id: "z", entry: null, polygon: rect(50, 500, 10, 10) }] }), "E-DUP-ID", "scenes[0].triggerZones[1].id")).toBe(true);
    const overlap = pkg({}, {
      portals: [
        { id: "y_h", from: "yard", to: "hall", entry: null, polygon: rect(0, 400, 50, 50) },
        { id: "y_h2", from: "yard", to: "hall", index: 1, entry: null, arrivalSpot: "d", polygon: rect(25, 400, 50, 50) },
        { id: "h_y", from: "hall", to: "yard", entry: null, polygon: rect(25, 400, 50, 50) },
      ],
    });
    expect(diagnostics(overlap).filter((d) => d.code === "W-ZONE-OVERLAP").map((d) => d.path)).toEqual(["portals[1].polygon"]);
  });
});

describe("phase-3 ui validation (spec 07 §7)", () => {
  const withUi = (ui: unknown): unknown => {
    const p = pkg();
    return { ...p, game: { ...p.game, ui } };
  };
  it("valid ui loads; bad numbers, flags and key lists are reported", () => {
    expect(() => loadContent(withUi({ inventorySlots: 4, inventoryHeight: 96, fadeMs: 0, clickFeedbackMs: 200, reactWhenNothingHappens: false, playerLinesAsMenu: true, cannotTextKeys: ["n"] }) as ContentPackage)).not.toThrow();
    const bad = diagnostics(withUi({ inventorySlots: 1.5, inventoryHeight: 0, fadeMs: -1, clickFeedbackMs: Number.NaN, reactWhenNothingHappens: "yes", playerLinesAsMenu: 1, cannotTextKeys: [""] }));
    expect(bad.map((d) => `${d.code} ${d.path}`)).toEqual([
      "E-NUMBER game.ui.inventorySlots",
      "E-NUMBER game.ui.inventoryHeight",
      "E-NUMBER game.ui.fadeMs",
      "E-NUMBER game.ui.clickFeedbackMs",
      "E-SCHEMA game.ui.reactWhenNothingHappens",
      "E-SCHEMA game.ui.playerLinesAsMenu",
      "E-SCHEMA game.ui.cannotTextKeys",
    ]);
    expect(has(withUi({ inventorySlots: 0 }), "E-NUMBER", "game.ui.inventorySlots")).toBe(true);
    expect(has(withUi("wide"), "E-SCHEMA", "game.ui")).toBe(true);
  });
});
