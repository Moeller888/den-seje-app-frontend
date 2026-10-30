import { loadContent } from "@adventure-engine/content";
import { Engine, saveChecksum, type SaveData } from "@adventure-engine/core";
import { MemoryStorage, SlotManager, type WriteResult } from "@adventure-engine/save";
import { describe, expect, it } from "vitest";
import { demoContent } from "../src/demo/content.ts";
import { continueChoice, corruptStatus, formatPlayTime, saveLoadable, savePlayerScene, slotInfo, writeFeedback, type SlotInfo } from "../src/model/saves.ts";

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

const info = (slot: string, state: SlotInfo["state"], savedAt: string | null = null, backup = false): SlotInfo => ({ slot, state, savedAt, playTimeMs: null, backup, reason: state === "corrupt" ? "damaged" : null });

describe("save UI model (phase 5)", () => {
  it("slotInfo reads display fields of a valid save and marks empty and damaged slots", () => {
    const slots = new SlotManager(new MemoryStorage(), "urmager");
    const raw = demoSave("2026-10-29T08:15:00.000Z");
    expect(slotInfo("slot1", slots.read("slot1"))).toEqual({ slot: "slot1", state: "empty", savedAt: null, playTimeMs: null, backup: false, reason: null });
    expect(slots.write("slot1", raw).ok).toBe(true);
    const ok = slotInfo("slot1", slots.read("slot1"));
    expect(ok.state).toBe("ok");
    expect(ok.savedAt).toBe("2026-10-29T08:15:00.000Z");
    expect(ok.playTimeMs).toBeTypeOf("number");
    slots.damage("slot1", raw.slice(0, 40));
    expect(slotInfo("slot1", slots.read("slot1"))).toEqual({ slot: "slot1", state: "corrupt", savedAt: null, playTimeMs: null, backup: true, reason: "damaged" });
    expect(slotInfo("slot2", { state: "corrupt", backup: null, reason: "unloadable" })).toMatchObject({ backup: false, reason: "unloadable" });
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

/** A save of the demo with its checksum recomputed after `change` (still intact, but changed on purpose). */
function resealed(raw: string, change: (d: Record<string, unknown>) => void): string {
  const d = JSON.parse(raw) as Record<string, unknown>;
  change(d);
  d["checksum"] = saveChecksum(d as unknown as SaveData);
  return JSON.stringify(d);
}

const otherGame = (d: Record<string, unknown>): void => {
  d["content"] = { ...(d["content"] as object), id: "another-game" };
};

/** A promise settled from outside (a commit that finishes later). */
function deferred(): { promise: Promise<boolean>; resolve: (ok: boolean) => void } {
  let resolve!: (ok: boolean) => void;
  const promise = new Promise<boolean>((r) => (resolve = r));
  return { promise, resolve };
}

describe("follow-up F5: save feedback only after a confirmed write", () => {
  it("Gemt and data-last-save wait for this write's own commit", async () => {
    const commit = deferred();
    const result: WriteResult = { ok: true, committed: commit.promise };
    let feedback: Awaited<ReturnType<typeof writeFeedback>> | null = null;
    const pending = writeFeedback("slot1", result, 7, true).then((f) => (feedback = f));
    // Nothing is shown while the commit is still running.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(feedback).toBeNull();
    commit.resolve(true);
    await pending;
    expect(feedback).toEqual({ lastSave: "slot1:7", notice: { kind: "saved" } });
    // An autosave updates data-last-save quietly.
    expect(await writeFeedback("auto", { ok: true, committed: Promise.resolve(true) }, 8, false)).toEqual({ lastSave: "auto:8", notice: null });
  });

  it("a failed write never shows Gemt", async () => {
    expect(await writeFeedback("slot1", { ok: true, committed: Promise.resolve(false) }, 3, true)).toEqual({ lastSave: "slot1:failed", notice: { kind: "failed", reason: "storage" } });
    expect(await writeFeedback("slot2", { ok: false, message: "full" }, 0, true)).toEqual({ lastSave: "slot2:failed", notice: { kind: "failed", reason: "full" } });
  });

  it("with a store that commits later, the feedback follows the slot write, not other writes", async () => {
    const commits: Array<ReturnType<typeof deferred>> = [];
    const store = Object.assign(new MemoryStorage(), {
      transaction: (fn: () => void): Promise<boolean> => {
        fn();
        const d = deferred();
        commits.push(d);
        return d.promise;
      },
    });
    const slots = new SlotManager(store, "clockmaker-demo");
    const first = writeFeedback("slot1", slots.write("slot1", demoSave("2026-10-30T10:00:00.000Z")), 1, true);
    const second = writeFeedback("slot2", slots.write("slot2", demoSave("2026-10-30T10:01:00.000Z")), 2, true);
    // The second write fails in the store, the first succeeds afterwards: each gets its own result.
    commits[1]?.resolve(false);
    commits[0]?.resolve(true);
    expect(await first).toEqual({ lastSave: "slot1:1", notice: { kind: "saved" } });
    expect(await second).toEqual({ lastSave: "slot2:failed", notice: { kind: "failed", reason: "storage" } });
  });
});

describe("follow-up: slot status checks that the save loads", () => {
  const content = loadContent(demoContent);

  it("saveLoadable runs the real validation: other content and (outside a dev build) wrong checksums fail", () => {
    const raw = demoSave("2026-10-30T09:00:00.000Z");
    expect(saveLoadable(content, false)(raw)).toBe(true);
    expect(saveLoadable(content, false)(resealed(raw, otherGame))).toBe(false);
    const tampered = raw.replace('"savedAt":"2026-10-30T09:00:00.000Z"', '"savedAt":"2026-10-30T09:00:01.000Z"');
    expect(tampered).not.toBe(raw);
    expect(saveLoadable(content, false)(tampered)).toBe(false);
    expect(saveLoadable(content, true)(tampered)).toBe(true);
  });

  it("an intact save of other content is shown as unloadable, with its loadable backup offered and named", () => {
    const store = new MemoryStorage();
    const slots = new SlotManager(store, "clockmaker-demo", { loadable: saveLoadable(content, false) });
    const raw = demoSave("2026-10-30T09:00:00.000Z");
    expect(slots.write("slot1", raw).ok).toBe(true);
    store.set("engine:clockmaker-demo:slot1", resealed(raw, otherGame));
    const i = slotInfo("slot1", slots.read("slot1"));
    expect(i).toMatchObject({ state: "corrupt", reason: "unloadable", backup: true });
    expect(continueChoice([i])).toEqual({ slot: "slot1", fromBackup: true });
    const texts: Record<string, string> = { "ui.corrupt": "beskadiget", "ui.unloadable": "kan ikke indlæses", "ui.backup_available": "sikkerhedskopi kan gendannes" };
    const t = (k: string): string => texts[k] ?? k;
    expect(corruptStatus(i, t)).toBe("kan ikke indlæses – sikkerhedskopi kan gendannes");
    expect(corruptStatus({ reason: "damaged", backup: false }, t)).toBe("beskadiget");
    expect(corruptStatus({ reason: null, backup: true }, t)).toBe("beskadiget – sikkerhedskopi kan gendannes");
  });
});
