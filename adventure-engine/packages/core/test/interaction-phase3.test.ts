import { loadContent, type ContentPackage, type Expr, type NodeDef, type UiConfig } from "@adventure-engine/content";
import { describe, expect, it } from "vitest";
import { Engine, TextService } from "../src/index.ts";
import { TestAdapter, harness } from "./helpers.ts";

const rect = (x: number, y: number, w: number, h: number): Array<[number, number]> => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const is = (v: string, c: string): Expr => ({ eq: [{ var: v }, { const: c }] });
const when = (action: string, target: string): Expr => ({ and: [is("$action", action), is("$target", target)] });

/** Synthetic shed: a crate, an owl, a door to the yard and five items in the hero's pocket. */
function shed(ui: UiConfig = { inventorySlots: 2 }, extraNodes: NodeDef[] = []): ContentPackage {
  return {
    game: { id: "t", version: "1", formatVersion: 1, languages: ["da", "en"], defaultLanguage: "da", player: { actor: "hero" }, entry: null, globals: {}, ui },
    scenes: [
      {
        id: "shed",
        entry: null,
        size: { width: 1280, height: 720 },
        spots: { a: { x: 100, y: 650 }, far: { x: 1000, y: 650 } },
        defaultSpot: "a",
        walkable: [rect(0, 600, 1280, 120)],
        objectZones: [{ entity: "crate", polygon: rect(300, 500, 100, 100) }],
        actorZones: [{ actor: "owl", polygon: rect(600, 500, 100, 100) }],
      },
      { id: "yard", entry: null, spots: { in: { x: 100, y: 650 } }, defaultSpot: "in" },
    ],
    portals: [{ id: "door", from: "shed", to: "yard", entry: null, polygon: rect(1200, 400, 80, 200) }],
    actors: [
      { id: "hero", nameKey: "a.hero", scene: "shed", spot: "a", entry: null, variants: { default: {} } },
      { id: "owl", nameKey: "a.owl", scene: "shed", spot: "far", entry: null, variants: { default: {} } },
      { id: "twin", scene: "shed", spot: "far", entry: null, variants: { default: {} } },
    ],
    objects: [
      { id: "crate", nameKey: "o.crate", container: { kind: "scene", id: "shed" }, entry: null, variants: { default: {} } },
      { id: "flint", nameKey: "o.flint", container: { kind: "actor", id: "hero" }, entry: "flint#main", variants: { default: {} } },
      { id: "tinder", nameKey: "o.tinder", container: { kind: "actor", id: "hero" }, entry: "tinder#main", variants: { default: {} } },
      { id: "rope", container: { kind: "actor", id: "hero" }, entry: "rope#main", variants: { default: {} } },
      { id: "map", container: { kind: "actor", id: "hero" }, entry: "map#main", variants: { default: {} } },
      { id: "pebble", container: { kind: "actor", id: "hero" }, entry: null, variants: { default: {} } },
    ],
    graphs: [
      {
        id: "flint",
        kind: "logic",
        nodes: [
          { id: "f0", type: "entry", name: "main", next: ["f1", "f3"] },
          { id: "f1", type: "guard", expr: when("use.inventory", "tinder"), next: ["f2"] },
          // Only a global write: that is "something happened".
          { id: "f2", type: "set", var: "lit", value: true },
          { id: "f3", type: "guard", expr: when("use.inventory", "pebble"), next: ["f4"] },
          { id: "f4", type: "move_object", object: "pebble", to: { kind: "none" } },
        ],
      },
      { id: "tinder", kind: "logic", nodes: [{ id: "t0", type: "entry", name: "main", next: ["t1"] }, { id: "t1", type: "guard", expr: is("$action", "interact") }] },
      {
        id: "rope",
        kind: "logic",
        nodes: [
          { id: "r0", type: "entry", name: "main", next: ["r1", "r3"] },
          { id: "r1", type: "guard", expr: when("use.object", "crate"), next: ["r2"] },
          { id: "r2", type: "return", value: false },
          { id: "r3", type: "guard", expr: when("use.inventory", "map"), next: ["r4"] },
          { id: "r4", type: "player_set", actor: "twin" },
        ],
      },
      {
        id: "map",
        kind: "logic",
        nodes: [
          { id: "m0", type: "entry", name: "main", next: ["m1"] },
          { id: "m1", type: "guard", expr: when("use.actor", "hero"), next: ["m2"] },
          // Only a walk (core navigation, no command): also "something happened".
          { id: "m2", type: "walk_to", actor: "hero", spot: "far" },
        ],
      },
      ...(extraNodes.length > 0 ? [{ id: "x", kind: "logic" as const, nodes: extraNodes }] : []),
    ],
    i18n: {
      da: { "a.hero": "Helt", "a.owl": "Ugle", "o.crate": "Kasse", "o.flint": "Flint", "o.tinder": "", "c.1": "Nej.", "c.2": "Umuligt." },
      en: { "a.hero": "Hero", "a.owl": "Owl", "o.crate": "Crate", "o.flint": "", "o.tinder": "Tinder", "c.1": "No.", "c.2": "Impossible." },
    },
  };
}

function setup(ui?: UiConfig, extraNodes: NodeDef[] = [], seed = "test") {
  const h = harness(shed(ui, extraNodes), { mode: "lenient", seed });
  h.engine.newGame();
  return h;
}

const reacts = (a: TestAdapter): number => a.types().filter((t) => t === "React").length;
const lastEvent = (e: Engine) => e.events.at(-1);
const settleWalks = (e: Engine): void => {
  for (let i = 0; i < 10000 && !e.idleReport().idle; i++) e.advanceTicks(1);
};

describe("inventory panel clicks (spec 04 D4, TS-D07/TS-D08)", () => {
  it("select, deselect with the same item, combine with another item and deselect", () => {
    const { engine, adapter } = setup();
    expect(engine.clickInventory("flint")).toBeNull();
    expect(engine.selectedItem).toBe("flint");
    expect(engine.cursor).toEqual({ mode: "use", item: "flint", target: null, targetKind: null, tooltipKey: null });
    engine.clickInventory("flint");
    expect(engine.selectedItem).toBeNull();
    expect(engine.cursor).toEqual({ mode: "idle", tooltipKey: "o.flint" });

    engine.clickInventory("flint");
    const run = engine.clickInventory("tinder");
    expect(run).not.toBeNull();
    expect(engine.selectedItem).toBeNull();
    expect(lastEvent(engine)).toMatchObject({ receiver: "flint", action: "use.inventory", ctx: { $item: "flint", $target: "tinder", $scene: "shed" } });
    expect(engine.globals.get("lit")).toBe(true);
    // A global write is "something happened": no reaction.
    expect(reacts(adapter)).toBe(0);
    expect(engine.idleReport().idle).toBe(true);
  });

  it("combination is asymmetric: the event goes to the selected item only", () => {
    const { engine, adapter } = setup();
    engine.clickInventory("tinder");
    engine.clickInventory("flint");
    expect(lastEvent(engine)).toMatchObject({ receiver: "tinder", action: "use.inventory", ctx: { $target: "flint" } });
    expect(engine.globals.has("lit")).toBe(false);
    expect(reacts(adapter)).toBe(1);
  });

  it("an item that is not in the player's inventory is a bad argument", () => {
    const { engine } = setup();
    expect(() => engine.clickInventory("crate")).toThrow(/inventory/);
    expect(() => engine.hoverInventory("crate")).toThrow(/inventory/);
  });
});

describe("\"cannot\" after use (spec 04 D3/D5)", () => {
  it("false reacts once; no effect reacts; entry null reacts; an effect never reacts", () => {
    const { engine, adapter } = setup();
    engine.selectItem("rope");
    engine.click({ objectZone: "crate" });
    expect(lastEvent(engine)).toMatchObject({ receiver: "rope", action: "use.object", ctx: { $target: "crate" } });
    expect(reacts(adapter)).toBe(1);

    engine.selectItem("pebble");
    engine.click({ actorZone: "owl" });
    expect(lastEvent(engine)).toMatchObject({ receiver: "pebble", action: "use.actor", ctx: { $target: "owl" } });
    expect(engine.finishedRuns.filter((r) => r.receiver === "pebble").at(-1)?.result).toBe(true);
    expect(reacts(adapter)).toBe(2);

    engine.clickInventory("flint");
    engine.clickInventory("pebble");
    expect(engine.world.actors.get("hero")?.inventory).not.toContain("pebble");
    expect(reacts(adapter)).toBe(2);
  });

  it("a walk started by the item's logic counts as an effect (use on the player itself)", () => {
    const { engine, adapter } = setup();
    engine.selectItem("map");
    engine.clickAt([100, 640]);
    expect(lastEvent(engine)).toMatchObject({ action: "walk" });
    expect(engine.events.some((e) => e.receiver === "map" && e.action === "use.actor" && e.ctx["$target"] === "hero")).toBe(true);
    expect(engine.isMoving("hero")).toBe(true);
    settleWalks(engine);
    expect(engine.world.actors.get("hero")?.spot).toBe("far");
    expect(reacts(adapter)).toBe(0);
  });

  it("reactWhenNothingHappens: false keeps \"cannot\" for false results only", () => {
    const { engine, adapter } = setup({ inventorySlots: 2, reactWhenNothingHappens: false });
    engine.clickInventory("tinder");
    engine.clickInventory("flint");
    expect(reacts(adapter)).toBe(0);
    engine.selectItem("rope");
    engine.click({ objectZone: "crate" });
    expect(reacts(adapter)).toBe(1);
  });

  it("with an item selected a logical portal click is a use without a target", () => {
    const { engine, adapter } = setup();
    engine.selectItem("rope");
    expect(engine.click({ portal: "door" })).toBeNull();
    expect(engine.selectedItem).toBeNull();
    expect(reacts(adapter)).toBe(1);
    expect(engine.world.actors.get("hero")?.scene).toBe("shed");
    engine.selectItem("rope");
    expect(() => engine.click({ objectZone: "nothing" })).toThrow(/no zone/);
  });

  it("cannot lines come from ui.cannotTextKeys via the seeded rng (deterministic per seed)", () => {
    const lines = (seed: string): Array<string | undefined> => {
      const { engine, adapter } = setup({ cannotTextKeys: ["c.1", "c.2"] }, [], seed);
      for (let i = 0; i < 6; i++) engine.clickAt([10, 10]);
      return adapter.log.filter((c) => c.type === "React").map((c) => (c.type === "React" ? c.textKey : undefined));
    };
    const a = lines("s1");
    expect(a).toHaveLength(6);
    expect(a.every((k) => k === "c.1" || k === "c.2")).toBe(true);
    expect(lines("s1")).toEqual(a);
    const { engine, adapter } = setup();
    engine.clickAt([10, 10]);
    expect(adapter.log.at(-1)).not.toHaveProperty("textKey");
  });
});

describe("modal input (spec 04 D7, TS-D04)", () => {
  it("busy cursor; scene and inventory clicks are ignored", () => {
    const { engine, adapter } = setup();
    const lock = engine.modal.acquire("test", "test");
    expect(engine.hoverInventory("flint")).toEqual({ mode: "busy" });
    expect(engine.cursor).toEqual({ mode: "busy" });
    expect(engine.clickInventory("flint")).toBeNull();
    expect(engine.selectedItem).toBeNull();
    expect(engine.click({ objectZone: "crate" })).toBeNull();
    expect(engine.clickAt([500, 650])).toBeNull();
    expect(engine.trace.filter((t) => t.kind === "input.ignored")).toHaveLength(3);
    expect(adapter.log).toHaveLength(1); // only the opening SceneFade
    engine.modal.release(lock);
    // The ignored scene click still moved the pointer there.
    expect(engine.cursor).toEqual({ mode: "walk", point: [500, 650] });
  });
});

describe("inventory window and selection lifetime (TS-D10)", () => {
  it("scroll is clamped to [0, items − slots]", () => {
    const { engine } = setup();
    expect(engine.inventory()).toEqual({
      items: ["flint", "tinder", "rope", "map", "pebble"],
      offset: 0,
      slots: 2,
      visible: ["flint", "tinder"],
      selected: null,
      canScrollBack: false,
      canScrollForward: true,
    });
    expect(engine.scrollInventory(-1)).toBe(0);
    expect(engine.scrollInventory(2)).toBe(2);
    expect(engine.scrollInventory(10)).toBe(3);
    expect(engine.inventory()).toMatchObject({ visible: ["map", "pebble"], canScrollBack: true, canScrollForward: false });
    expect(() => engine.scrollInventory(0.5)).toThrow(/integer/);
    expect(engine.trace.filter((t) => t.kind === "inventory.scroll").map((t) => t["offset"])).toEqual([2, 3]);
  });

  it("removing items re-clamps the window; a removed selected item clears the selection", () => {
    const { engine } = setup();
    engine.scrollInventory(3);
    engine.clickInventory("pebble");
    engine.hoverInventory("pebble");
    expect(engine.selectedItem).toBe("pebble");
    engine.world.moveObject("pebble", { kind: "none" }, null);
    expect(engine.selectedItem).toBeNull();
    expect(engine.pointer).toEqual({ kind: "inventory", item: null });
    expect(engine.inventory()).toMatchObject({ offset: 2, visible: ["rope", "map"] });
    expect(engine.trace.some((t) => t.kind === "select" && t["reason"] === "removed")).toBe(true);
  });

  it("switching the player re-evaluates the inventory; default slot count is 5", () => {
    const { engine } = setup({});
    expect(engine.inventorySlots).toBe(5);
    expect(engine.inventory()).toMatchObject({ canScrollForward: false });
    engine.clickInventory("rope");
    engine.clickInventory("map");
    expect(engine.world.playerId).toBe("twin");
    expect(engine.inventory().items).toEqual([]);
    expect(engine.selectedItem).toBeNull();
  });

  it("new game resets selection, pointer and window", () => {
    const { engine } = setup();
    engine.scrollInventory(1);
    engine.clickInventory("map");
    engine.newGame();
    expect(engine.selectedItem).toBeNull();
    expect(engine.pointer).toBeNull();
    expect(engine.inventory().offset).toBe(0);
    engine.selectItem("map");
    engine.clearSelection();
    expect(engine.selectedItem).toBeNull();
  });
});

describe("pointer over the inventory panel (spec 04 D2)", () => {
  it("the panel wins over the scene; tooltips name the hovered item", () => {
    const { engine } = setup();
    engine.hover([350, 550]);
    expect(engine.cursor).toMatchObject({ mode: "interact", target: "crate" });
    expect(engine.hoverInventory(null)).toEqual({ mode: "idle" });
    engine.selectItem("flint");
    expect(engine.hoverInventory("tinder")).toEqual({ mode: "use", item: "flint", target: "tinder", targetKind: "inventory", tooltipKey: "o.tinder" });
    expect(engine.hoverInventory("rope")).toMatchObject({ target: "rope", tooltipKey: null });
    expect(engine.hoverInventory("flint")).toMatchObject({ mode: "use", target: null });
    expect(engine.hoverInventory(null)).toMatchObject({ mode: "use", target: null });
    engine.pointerLeave();
    expect(engine.pointer).toBeNull();
    expect(engine.cursor).toEqual({ mode: "idle" });
    engine.clickAt([800, 100]);
    expect(engine.pointer).toEqual({ kind: "scene", point: [800, 100] });
  });
});

describe("text service (spec 06 F7, TS-F07)", () => {
  const content = loadContent({ ...shed(), game: { ...shed().game, fallbackLanguage: "da" } }, { mode: "lenient" });

  it("current language → fallbackLanguage; empty texts count as missing; one W-I18N-EMPTY per key and language", () => {
    const warnings: string[] = [];
    const text = new TextService(content, { language: "en", warn: (m) => warnings.push(m) });
    expect(text.language).toBe("en");
    expect(text.languages).toEqual(["da", "en"]);
    expect(text.chain()).toEqual(["en", "da"]);
    expect(text.resolve("a.owl")).toEqual({ text: "Owl", language: "en", fallback: false });
    expect(text.resolve("o.flint")).toEqual({ text: "Flint", language: "da", fallback: true });
    expect(text.t("o.flint")).toBe("Flint");
    expect(warnings).toHaveLength(1);
    expect(text.resolve("nope")).toEqual({ text: "", language: null, fallback: true });
    expect(warnings).toHaveLength(2);
    text.setLanguage("da");
    expect(text.chain()).toEqual(["da"]);
    expect(text.t("o.tinder")).toBe("");
    expect(warnings).toHaveLength(3);
    expect(() => text.setLanguage("fr")).toThrow(/unknown language/);
  });

  it("dev builds show the key; the engine reports W-I18N-EMPTY and presentation warnings", () => {
    const dev = new TextService(content, { dev: true, warn: () => {} });
    expect(dev.language).toBe("da");
    expect(dev.t("missing.key")).toBe("missing.key");
    // A language without any table falls back like a missing text.
    const bare = loadContent({ ...shed(), game: { ...shed().game, languages: ["da", "sv"], fallbackLanguage: "da" }, i18n: { da: shed().i18n?.["da"] ?? {} } }, { mode: "lenient" });
    expect(new TextService(bare, { language: "sv", warn: () => {} }).resolve("a.owl")).toEqual({ text: "Ugle", language: "da", fallback: true });
    const noTexts: ContentPackage = { ...shed() };
    delete (noTexts as { i18n?: unknown }).i18n;
    expect(new TextService(loadContent(noTexts, { mode: "lenient" }), { warn: () => {} }).resolve("a.owl")).toEqual({ text: "", language: null, fallback: true });
    const engine = new Engine(content, { seed: "s", adapter: new TestAdapter(), language: "en" });
    expect(engine.text.language).toBe("en");
    engine.text.t("o.flint");
    engine.reportWarning("W-ASSET-LOAD", "bg.shed failed to load; placeholder used");
    expect(engine.warnings.map((w) => w.code)).toEqual(["W-I18N-EMPTY", "W-ASSET-LOAD"]);
  });
});
