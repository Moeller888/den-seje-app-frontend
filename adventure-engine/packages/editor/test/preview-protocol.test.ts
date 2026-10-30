import { MemoryStorage, SlotManager, SettingsStore } from "@adventure-engine/save";
import { describe, expect, it } from "vitest";
import { localManifest, previewServices } from "../src/preview/protocol.ts";

describe("preview isolation (phase 6)", () => {
  it("saves and settings of a preview live in memory only", async () => {
    const before = typeof globalThis.localStorage;
    const s = previewServices();
    expect(s.kind).toBe("memory");
    expect(s.storage).toBeInstanceOf(MemoryStorage);
    new SettingsStore(s.storage, "lantern-demo").update({ muted: true });
    expect(new SlotManager(s.storage, "lantern-demo").write("slot1", "x").ok).toBe(false);
    await s.flush();
    // Two previews never share storage.
    expect(previewServices().storage.keys("engine:")).toEqual([]);
    expect(s.storage.keys("engine:")).toEqual(["engine:lantern-demo:settings"]);
    expect(typeof globalThis.localStorage).toBe(before);
  });

  it("asset urls are swapped for the editor's object URLs; other fields stay", () => {
    const m = localManifest(
      { a: { kind: "image", url: "assets/a.svg", bytes: 3 }, b: { kind: "audio", formats: [{ url: "assets/b.wav", type: "audio/wav" }, { url: "assets/b.ogg" }] } },
      { "assets/a.svg": "blob:1", "assets/b.wav": "blob:2" },
    );
    expect(m).toEqual({ a: { kind: "image", url: "blob:1", bytes: 3 }, b: { kind: "audio", formats: [{ url: "blob:2", type: "audio/wav" }, { url: "assets/b.ogg" }] } });
  });
});
