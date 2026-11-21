import { describe, expect, it } from "vitest";
import { FakeTaskService, type FakeSequence } from "@adventure-engine/learning-bridge/test-service";
import { ARCHIVE_ITEMS, CONTEXT_OF_STEP, OBJECTIVE, STEP_OF_CONTEXT } from "../src/host-items.ts";

/**
 * D-338: the test adapter running the SERVER's own policy module (supabase/functions/_shared/learning-sequence.ts,
 * loaded by path so this package does not import across the repository at type level). The world asks for
 * "next" with any contextKey; the order comes from the policy, not from the world.
 */
const SEQ_PATH = new URL("../../../../supabase/functions/_shared/learning-sequence.ts", import.meta.url).href;

async function service(): Promise<{ svc: FakeTaskService; advance: (h: number) => void }> {
  const policy = (await import(/* @vite-ignore */ SEQ_PATH)) as { nextStep: FakeSequence["nextStep"] };
  const svc = new FakeTaskService(ARCHIVE_ITEMS, { sequence: { nextStep: policy.nextStep, stepOfContext: STEP_OF_CONTEXT, contextOfStep: CONTEXT_OF_STEP } });
  let now = Date.parse("2026-11-04T08:00:00.000Z");
  svc.clock = () => now;
  return { svc, advance: (h) => (now += h * 3_600_000) };
}

const ask = (svc: FakeTaskService, contextKey = "arkivskab") =>
  svc.fetchTask({ objectiveId: OBJECTIVE.id, purpose: "practice", surface: "world", kinds: ["choice"], contextKey });
const answer = (svc: FakeTaskService, task: { instanceId: string }, optionId: string) =>
  svc.submit({ instanceId: task.instanceId, roundNo: 1, submissionId: `s-${task.instanceId}-${optionId}`, action: { kind: "choice", payload: { optionId } } });

describe("Arkivskabet × server sequence (D-338, test adapter running the server policy)", () => {
  it("pupil B: wrong practice → revision; then application → transfer → revisit waits → after 20 h revisit → complete", async () => {
    const { svc, advance } = await service();
    const t1 = await ask(svc);
    expect(t1).toMatchObject({ contextKey: "arkivskab", mode: "practice" });
    await answer(svc, t1, "kilde_b"); // wrong
    const t2 = await ask(svc, "skuffe"); // the world asks for anything — the server decides
    expect(t2).toMatchObject({ contextKey: "arkivskab-revision", mode: "practice" });
    await answer(svc, t2, "rev_avis"); // wrong again: the policy moves on (one revision, no loop)
    const t3 = await ask(svc);
    expect(t3).toMatchObject({ contextKey: "skuffe", mode: "check" });
    await answer(svc, t3, "kilde_f");
    const t4 = await ask(svc);
    expect(t4).toMatchObject({ contextKey: "overfoersel", mode: "application" });
    await answer(svc, t4, "t_brev");
    await expect(ask(svc, "genbesoeg")).rejects.toMatchObject({ code: "unavailable", message: expect.stringMatching(/^sequence_waiting until /) });
    advance(20);
    const t5 = await ask(svc);
    expect(t5).toMatchObject({ contextKey: "genbesoeg", mode: "review" });
    await answer(svc, t5, "gb_rapport");
    await expect(ask(svc)).rejects.toMatchObject({ message: "sequence_complete" });
  });

  it("pupil C: right practice → no revision; pupil E: asking for the transfer first still gets guided practice", async () => {
    const { svc } = await service();
    const first = await ask(svc, "overfoersel");
    expect(first.contextKey).toBe("arkivskab");
    await answer(svc, first, "kilde_a");
    expect((await ask(svc, "arkivskab-revision")).contextKey).toBe("skuffe");
  });

  it("an open round is resumed in its own step; nothing advances until it is answered", async () => {
    const { svc } = await service();
    const t1 = await ask(svc);
    expect((await ask(svc, "genbesoeg")).instanceId).toBe(t1.instanceId);
  });
});
