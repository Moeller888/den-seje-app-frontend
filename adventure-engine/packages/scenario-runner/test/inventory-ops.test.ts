import { describe, expect, it } from "vitest";
import { readScenario, runScenario, type Scenario, type Step } from "../src/index.ts";

/** Reuse the synthetic workshop of interaction-inventory-combine with new steps. */
const workshop = (steps: Step[]): Scenario => ({ ...readScenario("interaction-inventory-combine"), scenario: "workshop-ops", steps: [{ do: "newGame" }, ...steps] });

describe("phase-3 runner operations (inventory, use events)", () => {
  it("inventory window, scroll, selection and hover over the panel", () => {
    const r = runScenario(
      workshop([
        { do: "click", target: { objectZone: "rope" } },
        { expect: "inventoryWindow", offset: 0, visible: ["hook", "rope"] },
        { do: "scrollInventory", delta: 5 },
        { expect: "inventoryWindow", offset: 0, note: "2 items in 2 slots: nothing to scroll" },
        { do: "clickInventory", object: "hook" },
        { expect: "selectedItem", equals: "hook" },
        { do: "hoverInventory", object: "rope" },
        { expect: "cursor", mode: "use", item: "hook", target: "rope" },
        { do: "hoverInventory", object: null },
        { expect: "cursor", mode: "use", item: "hook" },
        { do: "clickInventory", object: "rope" },
        { expect: "selectedItem", equals: null },
        { expect: "runEvent", entity: "hook", action: "use.inventory", ctx: { $item: "hook", $target: "rope", $scene: "workshop" } },
        { expect: "inventory", actor: "keeper", equals: ["grapple"] },
        { expect: "inventoryWindow", visible: ["grapple"] },
      ]),
    );
    expect(r.error?.message ?? null).toBeNull();
    expect(r.passed).toBe(true);
  });

  it("failing inventory expectations report the step and reason", () => {
    const failing: Step[][] = [
      [{ expect: "inventory", actor: "keeper", equals: [] }],
      [{ expect: "inventory", actor: "ghost", equals: [] }],
      [{ expect: "selectedItem", equals: "hook" }],
      [{ expect: "inventoryWindow", offset: 1 }],
      [{ expect: "inventoryWindow", visible: [] }],
      [{ do: "clickInventory", object: "hook" }, { expect: "runEvent", entity: "hook", action: "use.inventory" }],
      [{ do: "clickInventory", object: "hook" }, { do: "clickInventory", object: "hook" }, { expect: "runEvent", entity: "hook", action: "interact" }],
      [{ do: "hoverInventory", object: 3 }],
      [{ do: "clickInventory", object: "valve" }],
      [{ do: "scrollInventory" }],
    ];
    for (const steps of failing) {
      const r = runScenario(workshop(steps));
      expect(r.passed, JSON.stringify(steps)).toBe(false);
      expect(["expectation", "format"]).toContain(r.error?.kind);
      expect(r.error?.message).toMatch(/^step \d+ \((do|expect): /);
    }
    const ctxMismatch = runScenario(
      workshop([
        { do: "click", target: { objectZone: "rope" } },
        { do: "clickInventory", object: "rope" },
        { do: "clickInventory", object: "hook" },
        { expect: "runEvent", entity: "rope", action: "use.inventory", ctx: { $target: "rope" } },
      ]),
    );
    expect(ctxMismatch.error?.message).toMatch(/no use.inventory event to "rope"/);
    const ctxMissing = runScenario(
      workshop([
        { do: "click", target: { objectZone: "rope" } },
        { do: "clickInventory", object: "rope" },
        { do: "clickInventory", object: "hook" },
        { expect: "runEvent", entity: "rope", action: "use.inventory", ctx: { $nothing: 1 } },
      ]),
    );
    expect(ctxMissing.passed).toBe(false);
  });
});
