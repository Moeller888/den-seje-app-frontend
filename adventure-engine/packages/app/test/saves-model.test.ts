import { loadContent } from "@adventure-engine/content";
import { Engine } from "@adventure-engine/core";
import { MemoryStorage, SlotManager } from "@adventure-engine/save";
import { describe, expect, it } from "vitest";
import { demoContent } from "../src/demo/content.ts";
import { continueChoice, formatPlayTime, savePlayerScene, slotInfo, type SlotInfo } from "../src/model/saves.ts";

/** A real save of the demo (idle right after the opening line). */
function demoSave(clock: string): string {
  const engine = new Engine(loadContent(demoContent), {
    seed: "demo",
    wallClock: () => clock,
    adapter: { onCommand: (c) => (c.type === "Say" ? { kind: "await" } : { kind: "auto", afterMs: 0 }) },
  });
  engine.newGame();
  for (let i = 0; i < 10000 && !engine.canSave(); i++) {
    const say = engine.pendingCommands().find((p) => p.type === "Say");
    if (say !== undefined) engine.reply(say.cmdId, { kind: "done" });
    else engine.advanceTicks(1);
  }
  let json = "";
  engine.requestSave((o) => {
    if (o.ok) json = o.json;
  });
  if (json === "") throw new Error("demo save failed");
  return json;
}

const info = (slot: string, state: SlotInfo["state"], savedAt: string | null = null, backup = false): SlotInfo => ({ slot, state, savedAt, playTimeMs: null, backup });

describe("save UI model (phase 5)", () => {
  it("slotInfo reads display fields of a valid save and marks empty and damaged slots", () => {
    const slots = new SlotManager(new MemoryStorage(), "urmager");
    const raw = demoSave("2026-10-29T08:15:00.000Z");
    expect(slotInfo("slot1", slots.read("slot1"))).toEqual({ slot: "slot1", state: "empty", savedAt: null, playTimeMs: null, backup: false });
    expect(slots.write("slot1", raw).ok).toBe(true);
    const ok = slotInfo("slot1", slots.read("slot1"));
    expect(ok.state).toBe("ok");
    expect(ok.savedAt).toBe("2026-10-29T08:15:00.000Z");
    expect(ok.playTimeMs).toBeTypeOf("number");
    slots.damage("slot1", raw.slice(0, 40));
    expect(slotInfo("slot1", slots.read("slot1"))).toEqual({ slot: "slot1", state: "corrupt", savedAt: null, playTimeMs: null, backup: true });
    expect(slotInfo("slot2", { state: "corrupt", backup: null }).backup).toBe(false);
  });

  it("slotInfo is defensive about fields it cannot read", () => {
    expect(slotInfo("a", { state: "ok", raw: "{" })).toMatchObject({ savedAt: null, playTimeMs: null });
    expect(slotInfo("a", { state: "ok", raw: "[1]" })).toMatchObject({ savedAt: null, playTimeMs: null });
    expect(slotInfo("a", { state: "ok", raw: "null" })).toMatchObject({ savedAt: null, playTimeMs: null });
    expect(slotInfo("a", { state: "ok", raw: '{"savedAt":1,"playTimeMs":-5}' })).toMatchObject({ savedAt: null, playTimeMs: null });
    expect(slotInfo("a", { state: "ok", raw: '{"savedAt":"x","playTimeMs":1e999}' })).toMatchObject({ savedAt: "x", playTimeMs: null });
    expect(slotInfo("a", { state: "ok", raw: '{"playTimeMs":"7"}' })).toMatchObject({ playTimeMs: null });
  });

  it("TS-A03: Fortsæt picks the newest valid save, else a backup, else nothing", () => {
    expect(continueChoice([])).toBeNull();
    expect(continueChoice([info("auto", "empty"), info("slot1", "corrupt")])).toBeNull();
    expect(continueChoice([info("auto", "ok", "2026-01-01T10:00:00.000Z"), info("slot1", "ok", "2026-01-02T09:00:00.000Z"), info("slot2", "ok", "2026-01-01T12:00:00.000Z")])).toEqual({ slot: "slot1", fromBackup: false });
    // Ties and missing times keep the earlier slot.
    expect(continueChoice([info("auto", "ok", "2026-01-01T10:00:00.000Z"), info("slot1", "ok", "2026-01-01T10:00:00.000Z")])).toEqual({ slot: "auto", fromBackup: false });
    expect(continueChoice([info("auto", "ok"), info("slot1", "ok")])).toEqual({ slot: "auto", fromBackup: false });
    expect(continueChoice([info("auto", "ok"), info("slot1", "ok", "2026-01-01T10:00:00.000Z")])).toEqual({ slot: "slot1", fromBackup: false });
    expect(continueChoice([info("auto", "ok", "2026-01-01T10:00:00.000Z"), info("slot1", "ok")])).toEqual({ slot: "auto", fromBackup: false });
    // A valid save wins over a backup; otherwise the first damaged slot with a backup.
    expect(continueChoice([info("auto", "corrupt", null, true), info("slot1", "ok")])).toEqual({ slot: "slot1", fromBackup: false });
    expect(continueChoice([info("auto", "corrupt"), info("slot1", "corrupt", null, true), info("slot2", "corrupt", null, true)])).toEqual({ slot: "slot1", fromBackup: true });
  });

  it("play time is shown as m:ss or h:mm:ss", () => {
    expect(formatPlayTime(0)).toBe("0:00");
    expect(formatPlayTime(-10)).toBe("0:00");
    expect(formatPlayTime(65_999)).toBe("1:05");
    expect(formatPlayTime(3_600_000 + 2 * 60_000 + 3_000)).toBe("1:02:03");
  });

  it("savePlayerScene finds the player's scene for preloading", () => {
    expect(savePlayerScene(demoSave("2026-10-29T08:15:00.000Z"))).toBe("workroom");
    expect(savePlayerScene("not json")).toBeNull();
    expect(savePlayerScene('{"playerId":3,"actors":[]}')).toBeNull();
    expect(savePlayerScene('{"playerId":"p","actors":{}}')).toBeNull();
    expect(savePlayerScene('{"playerId":"p","actors":[null,{"id":"q","scene":"a"}]}')).toBeNull();
    expect(savePlayerScene('{"playerId":"p","actors":[{"id":"p","scene":null}]}')).toBeNull();
    expect(savePlayerScene('{"playerId":"p","actors":[{"id":"p","scene":"hall"}]}')).toBe("hall");
  });
});
