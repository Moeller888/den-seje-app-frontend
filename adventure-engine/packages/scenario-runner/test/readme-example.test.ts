import { loadContent } from "@adventure-engine/content";
import { Engine } from "@adventure-engine/core";
import { describe, expect, it } from "vitest";
import { HeadlessAdapter, readScenario } from "../src/index.ts";

describe("README world/movement example", () => {
  it("runs as documented", () => {
    const content = loadContent({
      game: { id: "demo", version: "1", formatVersion: 1, languages: ["da"], defaultLanguage: "da", player: { actor: "hero" } },
      scenes: [
        {
          id: "yard",
          entry: null,
          size: { width: 2000, height: 720 },
          walkSpeed: 300,
          spots: { start: { x: 100, y: 600 }, gate: { x: 1800, y: 600, facing: "right" } },
          defaultSpot: "start",
          walkable: [[[0, 500], [2000, 500], [2000, 720], [0, 720]]],
          blockers: [[[800, 550], [900, 550], [900, 720], [800, 720]]],
        },
      ],
      actors: [{ id: "hero", scene: "yard", spot: "start", entry: null, variants: { default: {} } }],
    });
    const engine = new Engine(content, { seed: "demo", adapter: new HeadlessAdapter() });
    engine.newGame();
    expect(engine.hover([1200, 600])).toEqual({ mode: "walk", point: [1200, 600] });
    engine.walkPlayerTo("gate");
    while (!engine.idleReport().idle) engine.advanceTicks(1);
    expect(engine.world.actors.get("hero")).toMatchObject({ pos: [1800, 600], facing: "right", spot: "gate" });
    expect(engine.world.scrollX).toBe(720);
  });
});

describe("README inventory example", () => {
  it("runs as documented (on the synthetic workshop of interaction-inventory-combine)", () => {
    const adapter = new HeadlessAdapter();
    const engine = new Engine(loadContent(readScenario("interaction-inventory-combine").content), { seed: "demo", adapter });
    engine.newGame();
    engine.click({ objectZone: "rope" });
    engine.clickInventory("hook");
    expect(engine.cursor).toMatchObject({ mode: "use", item: "hook" });
    engine.clickInventory("hook");
    expect(engine.selectedItem).toBeNull();
    engine.clickInventory("hook");
    engine.clickInventory("rope");
    expect(engine.events.at(-1)).toMatchObject({ receiver: "hook", action: "use.inventory", ctx: { $item: "hook", $target: "rope", $scene: "workshop" } });
    expect(engine.inventory()).toEqual({ items: ["grapple"], offset: 0, slots: 2, visible: ["grapple"], selected: null, canScrollBack: false, canScrollForward: false });
    expect(engine.scrollInventory(1)).toBe(0);
    engine.selectItem("grapple");
    engine.click({ actorZone: "cat" });
    expect(engine.events.at(-1)).toMatchObject({ receiver: "grapple", action: "use.actor" });
    expect(adapter.log.at(-1)).toMatchObject({ type: "React", kind: "cannot" });
  });
});
