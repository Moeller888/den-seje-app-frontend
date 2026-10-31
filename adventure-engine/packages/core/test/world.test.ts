import { loadContent, type ContainerRef } from "@adventure-engine/content";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { WorldState, type WorldChange } from "../src/index.ts";
import { basePackage } from "./helpers.ts";

const content = loadContent(basePackage([]));

const containers: ContainerRef[] = [
  { kind: "none" },
  { kind: "scene", id: "room" },
  { kind: "scene", id: "yard2" },
  { kind: "actor", id: "hero" },
  { kind: "actor", id: "owl" },
  { kind: "actor", id: "ghost" },
];

describe("WorldState (spec 01 A2)", () => {
  it("TS-A04: after any move sequence every object has exactly one container and inventories match (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom("box", "key", "nope"), fc.constantFrom(...containers)), { maxLength: 40 }), (moves) => {
        const changes: WorldChange[] = [];
        const w = new WorldState(content, (c) => changes.push(c));
        for (const [obj, to] of moves) w.moveObject(obj, to, null);
        for (const [id, o] of w.objects) {
          const holders = [...w.actors.values()].filter((a) => a.inventory.includes(id));
          if (o.container.kind === "actor") {
            if (holders.length !== 1 || holders[0]?.id !== o.container.id) return false;
          } else if (holders.length !== 0) return false;
        }
        for (const a of w.actors.values()) {
          if (new Set(a.inventory).size !== a.inventory.length) return false;
        }
        return changes.every((c) => c.kind === "object.moved");
      }),
    );
  });

  it("inventory keeps insertion order; unknown objects/containers change nothing", () => {
    const w = new WorldState(content, () => {});
    expect(w.actors.get("hero")?.inventory).toEqual(["key"]);
    expect(w.moveObject("box", { kind: "actor", id: "hero" }, null)).toBe(true);
    expect(w.actors.get("hero")?.inventory).toEqual(["key", "box"]);
    expect(w.moveObject("box", { kind: "actor", id: "hero" }, "a")).toBe(true);
    expect(w.objects.get("box")?.spot).toBe("a");
    expect(w.moveObject("ghost", { kind: "none" }, null)).toBe(false);
    expect(w.moveObject("box", { kind: "scene", id: "nowhere" }, null)).toBe(false);
    expect(w.isValidContainer({ kind: "none" })).toBe(true);
  });

  it("dialog stack: push, pop never removes the last entry, replace top (B-08)", () => {
    const w = new WorldState(content, () => {});
    expect(w.topDialog("owl")).toBeUndefined();
    expect(w.topDialog("ghost")).toBeUndefined();
    expect(w.replaceTopDialog("owl", "a#x")).toBe(true);
    expect(w.pushDialog("owl", "a#y")).toBe(true);
    expect(w.replaceTopDialog("owl", "a#z")).toBe(true);
    expect(w.actors.get("owl")?.dialogStack).toEqual(["a#x", "a#z"]);
    expect(w.popDialog("owl")).toBe(true);
    expect(w.popDialog("owl")).toBe(false);
    expect(w.pushDialog("ghost", "a#x")).toBe(false);
    expect(w.replaceTopDialog("ghost", "a#x")).toBe(false);
    expect(w.popDialog("ghost")).toBe(false);
  });

  it("variants, spots, rename, portal locks and player changes", () => {
    const w = new WorldState(content, () => {});
    expect(w.setVariant("owl", "wet")).toBe(true);
    expect(w.setVariant("room", "dark")).toBe(true);
    expect(w.setVariant("owl", "dry")).toBe(false);
    expect(w.setVariant("ghost", "wet")).toBe(false);
    expect(w.setActorSpot("owl", "a")).toBe(true);
    expect(w.setActorSpot("ghost", "a")).toBe(false);
    expect(w.moveActor("ghost", "room", null)).toBe(false);
    expect(w.moveActor("owl", "nowhere", null)).toBe(false);
    expect(w.rename("ghost", "k")).toBe(false);
    expect(w.setPortalLocked("ghost", true)).toBe(false);
    expect(w.setPlayer("ghost")).toBe(false);
  });
});
