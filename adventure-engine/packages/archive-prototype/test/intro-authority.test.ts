import { describe, expect, it } from "vitest";
import { PROTOCOL, PROTOCOL_V2 } from "@adventure-engine/learning-bridge";
import { CONTEXT_KEY, DRAWER_KEY } from "../src/content.ts";
import { REVISION_KEY, showsLocalIntroduction } from "../src/sequence.ts";

/**
 * F11-B: one introduction, never two. A bridge/3 session (the host shows the SERVER's introduction) never shows the
 * local INTRO_CARDS; a bridge/2 session (server introduction switched off) keeps the prototype's local introduction.
 */
describe("which introduction is authoritative", () => {
  it("bridge/2 (server introduction off): the local introduction, once, at the first decision point — as before F11-B", () => {
    expect(showsLocalIntroduction(CONTEXT_KEY, false, PROTOCOL_V2)).toBe(true);
    expect(showsLocalIntroduction(CONTEXT_KEY, true, PROTOCOL_V2)).toBe(false);
    expect(showsLocalIntroduction(DRAWER_KEY, false, PROTOCOL_V2)).toBe(false);
    expect(showsLocalIntroduction(REVISION_KEY, false, PROTOCOL_V2)).toBe(false);
  });

  it("bridge/3 (server introduction on): never the local cards — the server decides, so the pupil never meets two", () => {
    expect(showsLocalIntroduction(CONTEXT_KEY, false, PROTOCOL)).toBe(false);
    expect(showsLocalIntroduction(CONTEXT_KEY, true, PROTOCOL)).toBe(false);
    expect(showsLocalIntroduction(DRAWER_KEY, false, PROTOCOL)).toBe(false);
  });

  it("no session (the handshake failed): the local prototype behaviour, as before", () => {
    expect(showsLocalIntroduction(CONTEXT_KEY, false, null)).toBe(true);
  });
});
