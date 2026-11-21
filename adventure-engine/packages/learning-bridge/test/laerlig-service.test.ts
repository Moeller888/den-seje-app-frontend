import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FLAGS, LaerligTaskService, createLaerligTaskService, type EdgeCaller } from "../src/laerlig-service.ts";
import { ServiceError, type TaskQuery } from "../src/service.ts";
import { FakeTaskService } from "../src/test-service.ts";
import { ITEMS, flush, pair } from "./harness.ts";

/**
 * MOCK HTTP — these tests pin the adapter's mapping of the EXISTING Edge Function contracts (D-309).
 * They prove nothing about the server; tests/isolated/laerligverse-backend.isolated.spec.mjs runs the
 * same adapter against the real Edge Functions and PostgreSQL.
 */
const Q: TaskQuery = { objectiveId: "hist.besaettelsen.h4", purpose: "check", surface: "world", kinds: ["choice", "short_text"], contextKey: "arkivskab" };
const ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const MC = {
  question_instance_id: ID, round_no: 1, answer_format: "mc", answer_type: "short", wave_phase: "challenge", metadata: null,
  content: { question: "Hvornår blev Danmark besat?", options: ["9. april 1940", "29. august 1943", "4. maj 1945"] },
};

function scripted(...replies: Array<{ status: number; body: unknown } | Error>) {
  const calls: Array<{ fn: string; body: Record<string, unknown> }> = [];
  const call: EdgeCaller = async (fn, body) => {
    calls.push({ fn, body: { ...body } });
    const r = replies.shift();
    if (r === undefined) throw new Error("no scripted reply left");
    if (r instanceof Error) throw r;
    return r;
  };
  return { call, calls };
}

describe("LaerligTaskService — feature flag", () => {
  it("is off by default and cannot be created without the flag", () => {
    expect(DEFAULT_FLAGS.laerligverseBackend).toBe(false);
    expect(() => createLaerligTaskService(DEFAULT_FLAGS, { call: async () => ({ status: 200, body: {} }), subject: "historie" })).toThrow(/disabled/);
    expect(createLaerligTaskService({ laerligverseBackend: true }, { call: async () => ({ status: 200, body: {} }), subject: "historie" })).toBeInstanceOf(LaerligTaskService);
  });
});

describe("LaerligTaskService — get-next-question mapping (mock HTTP)", () => {
  it("maps an MC question to a choice task with opaque option ids, subject only, no hints", async () => {
    const s = scripted({ status: 200, body: MC });
    const svc = new LaerligTaskService({ call: s.call, subject: "historie" });
    const t = await svc.fetchTask(Q);
    expect(s.calls).toEqual([{ fn: "get-next-question", body: { subject: "historie" } }]);
    expect(t).toMatchObject({ instanceId: ID, kind: "choice", mode: "quiz_v1", hintsAvailable: 0, roundNo: 1, contextKey: "arkivskab" });
    expect(t.options).toEqual([{ id: "o1", label: "9. april 1940" }, { id: "o2", label: "29. august 1943" }, { id: "o3", label: "4. maj 1945" }]);
    expect(svc.targeting).toBe("subject-only");
    expect(await svc.openTask()).toEqual(t);
  });

  it("maps typed questions (text, and MC with force_text) to short_text", async () => {
    const s = scripted(
      { status: 200, body: { ...MC, answer_format: "text", content: { question: "Stav ordet" } } },
      { status: 200, body: { ...MC, question_instance_id: ID.replace("6f", "7f"), content: { ...MC.content, force_text: true } } },
    );
    const svc = new LaerligTaskService({ call: s.call, subject: "dansk" });
    expect((await svc.fetchTask(Q)).kind).toBe("short_text");
    expect((await svc.fetchTask(Q)).kind).toBe("short_text");
  });

  it("refuses formats the bridge cannot render, and kinds the world did not offer", async () => {
    for (const body of [{ ...MC, answer_format: "number" }, { ...MC, answer_format: "match" }, { ...MC, answer_format: "text", answer_type: "long" }]) {
      const svc = new LaerligTaskService({ call: scripted({ status: 200, body }).call, subject: "historie" });
      await expect(svc.fetchTask(Q)).rejects.toMatchObject({ code: "unavailable" });
    }
    const svc = new LaerligTaskService({ call: scripted({ status: 200, body: MC }).call, subject: "historie" });
    await expect(svc.fetchTask({ ...Q, kinds: ["short_text"] })).rejects.toMatchObject({ code: "unavailable" });
  });

  it("maps no_questions, the 500 'Unauthorized', 5xx, network failure and malformed bodies", async () => {
    const cases: Array<[{ status: number; body: unknown } | Error, string, boolean]> = [
      [{ status: 200, body: { step: "no_questions" } }, "unavailable", false],
      [{ status: 500, body: { error: "Unauthorized" } }, "unauthorized", false],
      [{ status: 401, body: {} }, "unauthorized", false],
      [{ status: 503, body: {} }, "server", true],
      [new TypeError("Failed to fetch"), "network", true],
      [{ status: 200, body: { ...MC, question_instance_id: "not-a-uuid" } }, "server", false],
      [{ status: 200, body: { ...MC, content: { question: "x", options: ["only one"] } } }, "server", false],
      [{ status: 200, body: "html" }, "server", false],
    ];
    for (const [reply, code, transient] of cases) {
      const svc = new LaerligTaskService({ call: scripted(reply).call, subject: "historie" });
      const err = await svc.fetchTask(Q).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ServiceError);
      expect(err).toMatchObject({ code, transient });
    }
  });
});

describe("LaerligTaskService — process-event mapping (mock HTTP)", () => {
  async function served(...after: Array<{ status: number; body: unknown } | Error>) {
    const s = scripted({ status: 200, body: MC }, ...after);
    const svc = new LaerligTaskService({ call: s.call, subject: "historie", now: () => 1_793_600_000_000 });
    const t = await svc.fetchTask(Q);
    return { s, svc, t };
  }
  const sub = (optionId: string) => ({ instanceId: ID, roundNo: 1, submissionId: "sub-1", action: { kind: "choice" as const, payload: { optionId } } });

  it("sends the option TEXT on the legacy path — no round_no, no submission_id (H5 is not applied)", async () => {
    const { s, svc } = await served({ status: 200, body: { status: "correct", correct_answer: "9. april 1940", review_text: null } });
    const r = await svc.submit(sub("o1"));
    expect(s.calls[1]).toEqual({ fn: "process-event", body: { question_instance_id: ID, answer: "9. april 1940", question_shown_at: 1_793_600_000_000 } });
    expect(r).toEqual({ outcome: "correct", feedbackText: null, correctAnswer: "9. april 1940", evidence: "none", replay: false });
    expect(await svc.openTask()).toBeNull();
  });

  it("an incorrect verdict carries the review text and the key, only now", async () => {
    const { svc } = await served({ status: 200, body: { status: "incorrect", correct_answer: "9. april 1940", review_text: "Besættelsen skete 9. april 1940." } });
    expect(await svc.submit(sub("o3"))).toMatchObject({ outcome: "incorrect", feedbackText: "Besættelsen skete 9. april 1940.", correctAnswer: "9. april 1940" });
  });

  it("a manipulated option id or kind never reaches the server", async () => {
    const { s, svc } = await served();
    await expect(svc.submit(sub("o9"))).rejects.toMatchObject({ code: "invalid" });
    await expect(svc.submit({ ...sub("o1"), action: { kind: "short_text", payload: { text: "9. april 1940" } } })).rejects.toMatchObject({ code: "invalid" });
    await expect(svc.submit({ ...sub("o1"), instanceId: "00000000-0000-4000-8000-000000000000" })).rejects.toMatchObject({ code: "not_found" });
    expect(s.calls).toHaveLength(1);
  });

  it("maps 401/403/404/426/400/5xx/network and refuses an unexpected body", async () => {
    const cases: Array<[{ status: number; body: unknown } | Error, string, boolean]> = [
      [{ status: 401, body: { error: "Unauthorized" } }, "unauthorized", false],
      [{ status: 403, body: { error: "Forbidden" } }, "forbidden", false],
      [{ status: 404, body: {} }, "not_found", false],
      [{ status: 426, body: { outcome: "client_outdated" } }, "outdated", false],
      [{ status: 400, body: {} }, "invalid", false],
      [{ status: 500, body: { error: "x" } }, "server", true],
      [new Error("socket hang up"), "network", true],
      [{ status: 200, body: { status: "mastered" } }, "server", true],
      [{ status: 302, body: {} }, "invalid", false],
    ];
    for (const [reply, code, transient] of cases) {
      const { svc } = await served(reply);
      await expect(svc.submit(sub("o1"))).rejects.toMatchObject({ code, transient });
    }
  });

  it("declares per-instance server idempotency and refuses hints honestly", async () => {
    const { svc } = await served();
    expect(svc.submitRetry).toBe("server-idempotent");
    await expect(svc.hint()).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("bridge host — retry safety and backend data it cannot carry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const CHECK = { objectiveId: "hist.besaettelsen.h4", purpose: "check", surface: "world", contextKey: "arkivskab" } as const;

  it("without server idempotency an ambiguous failure is NOT resent: explicit unresolved state, one attempt", async () => {
    const service = new FakeTaskService(ITEMS);
    service.submitRetry = "none";
    const spy = vi.spyOn(service, "submit");
    const p = pair({ service });
    const c = p.client.connect();
    await flush();
    await c;
    const t = p.client.requestTask(CHECK);
    await flush();
    const task = await t;
    service.injectFailures("network");
    const r = p.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "opt_a" } });
    await flush();
    expect(await r).toMatchObject({ outcome: "aborted", retryable: false });
    expect(spy).toHaveBeenCalledTimes(1);
    // A second commit gets the same unresolved state — never a fresh submission.
    const again = p.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "opt_a" } });
    await flush();
    expect(await again).toMatchObject({ outcome: "aborted", retryable: false });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(p.store.map.size).toBe(1);
  });

  it("backend data the protocol cannot carry becomes an explicit error, not a hanging request", async () => {
    const big = { ...ITEMS[0]!, prompt: "x".repeat(1001) };
    const errors: unknown[] = [];
    const p = pair({ service: new FakeTaskService([big]), host: { onServiceError: (e) => errors.push(e) } });
    const c = p.client.connect();
    await flush();
    await c;
    const t = p.client.requestTask(CHECK);
    await flush();
    await expect(t).rejects.toMatchObject({ code: "server_error" });
    expect(errors).toHaveLength(1);
  });

  it("an expired session reaches the game as session_expired", async () => {
    const service = new FakeTaskService(ITEMS);
    vi.spyOn(service, "fetchTask").mockRejectedValue(new ServiceError("unauthorized", false));
    const p = pair({ service });
    const c = p.client.connect();
    await flush();
    await c;
    const t = p.client.requestTask(CHECK);
    await flush();
    await expect(t).rejects.toMatchObject({ code: "session_expired" });
  });

  it("a failing openTask during the handshake is reported and the game still connects (no resumption)", async () => {
    const service = new FakeTaskService(ITEMS);
    vi.spyOn(service, "openTask").mockRejectedValue(new ServiceError("network", true));
    const errors: unknown[] = [];
    const p = pair({ service, host: { onServiceError: (e) => errors.push(e) } });
    const c = p.client.connect();
    await flush();
    expect(await c).toBeNull();
    expect(errors).toHaveLength(1);
  });

  it("a failing hint call becomes hint_unavailable; a service that throws synchronously is still a reply", async () => {
    const service = new FakeTaskService(ITEMS);
    const p = pair({ service });
    const c = p.client.connect();
    await flush();
    await c;
    const t = p.client.requestTask(CHECK);
    await flush();
    const task = await t;
    vi.spyOn(service, "hint").mockImplementation(() => {
      throw new ServiceError("invalid", false);
    });
    const h = p.client.hint(task.instanceToken, 1);
    await flush();
    await expect(h).rejects.toMatchObject({ code: "invalid_message" });
  });

  it("a corrupt pending entry in storage is dropped, and a fresh submission is made", async () => {
    const service = new FakeTaskService(ITEMS);
    const p = pair({ service });
    const c = p.client.connect();
    await flush();
    await c;
    const t = p.client.requestTask(CHECK);
    await flush();
    const task = await t;
    // Pending entries are keyed per instance AND round (D-321 QA).
    p.store.setItem("lvb2:pending:inst-1#1", "{not json");
    const r = p.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "opt_a" } });
    await flush();
    expect((await r).outcome).toBe("correct");
    expect(p.store.map.size).toBe(0);
  });

  it("the duplicate log is bounded: a remembered request is answered from memory, a forgotten one is handled again", async () => {
    const p = pair();
    const c = p.client.connect();
    await flush();
    await c;
    const nonce = p.host.sessionNonce as string;
    const req = (requestId: string) => ({ protocol: "laerligverse.bridge/2", type: "task.request", nonce, requestId, ...CHECK });
    await p.rawToHost(req("first"));
    await flush();
    const fetches = () => p.service.calls.filter((x) => x === "fetchTask").length;
    expect(fetches()).toBe(1);
    await p.rawToHost(req("first"));
    expect(fetches()).toBe(1); // remembered: replayed, not fetched again
    for (let i = 0; i < 500; i++) {
      await p.rawToHost({ protocol: "laerligverse.bridge/2", type: "hint.request", nonce, requestId: `f${i}`, instanceToken: "none", level: 1 });
    }
    await p.rawToHost(req("first"));
    await flush();
    expect(fetches()).toBe(2); // forgotten after 500 newer ids: handled again (the server serves the same open instance)
  });
});


describe("LaerligTaskService — objective targeting, D-329/D-330 (mock HTTP; the real server is in objective-targeting + laerligverse-evidence isolated specs)", () => {
  const MAP = { "hist.besaettelsen.h4": "world_war_2" } as const;
  const TARGETED = { ...MC, learning_objective: "world_war_2" };

  it("sends the HOST-mapped existing objective and accepts only a reply that echoes it", async () => {
    const s = scripted({ status: 200, body: TARGETED });
    const svc = new LaerligTaskService({ call: s.call, subject: "historie", objectiveMap: MAP });
    const t = await svc.fetchTask(Q);
    expect(s.calls).toEqual([{ fn: "get-next-question", body: { subject: "historie", learning_objective: "world_war_2" } }]);
    expect(t.objective).toBe("world_war_2");
    expect(svc.targeting).toBe("objective");
  });

  it("a server that ignores the objective (no echo, or another one) is refused — no random question as the objective's task (C3)", async () => {
    for (const body of [MC, { ...MC, learning_objective: "cold_war" }]) {
      const svc = new LaerligTaskService({ call: scripted({ status: 200, body }).call, subject: "historie", objectiveMap: MAP });
      await expect(svc.fetchTask(Q)).rejects.toMatchObject({ code: "unavailable", transient: false });
      expect(await svc.openTask()).toBeNull();
    }
  });

  it("an objective the host does not map is never sent untargeted (no request at all)", async () => {
    const s = scripted();
    const svc = new LaerligTaskService({ call: s.call, subject: "historie", objectiveMap: MAP });
    for (const objectiveId of ["hist.unknown", "__proto__", "constructor"]) {
      await expect(svc.fetchTask({ ...Q, objectiveId })).rejects.toMatchObject({ code: "unavailable" });
    }
    expect(s.calls).toEqual([]);
  });

  it("maps 400 / 403 / 409 / objective_exhausted / timeout and malformed replies without retrying refusals", async () => {
    const cases: Array<[{ status: number; body: unknown } | Error, string, boolean]> = [
      [{ status: 400, body: { error: "invalid_learning_objective" } }, "invalid", false],
      [{ status: 403, body: { error: "learning_objective_not_allowed" } }, "forbidden", false],
      [{ status: 409, body: { error: "open_question_other_objective" } }, "unavailable", false],
      // A lost race for the one open instance: transient, the host's retry is served that instance.
      [{ status: 409, body: { error: "open_question_exists" } }, "unavailable", true],
      [{ status: 200, body: { step: "no_questions", reason: "objective_exhausted" } }, "unavailable", false],
      [{ status: 504, body: null }, "server", true],
      [new Error("timeout"), "network", true],
      [{ status: 200, body: { ...TARGETED, question_instance_id: "not-a-uuid" } }, "server", false],
      [{ status: 200, body: { learning_objective: "world_war_2" } }, "server", false],
    ];
    for (const [reply, code, transient] of cases) {
      const svc = new LaerligTaskService({ call: scripted(reply).call, subject: "historie", objectiveMap: MAP });
      await expect(svc.fetchTask(Q), JSON.stringify(reply instanceof Error ? reply.message : reply)).rejects.toMatchObject({ code, transient });
    }
  });
});

describe("LaerligTaskService — H5 submissions, D-273/D-330 (mock HTTP)", () => {
  const SUB = "0b8f7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d";
  const recorded = { outcome: "recorded", status: "correct", correct_answer: "9. april 1940", review_text: null, misconception_type: null, round_no: 1, xp_awarded: 10, coins_awarded: 5 };

  async function served(svcReplies: Array<{ status: number; body: unknown }>, h5 = true) {
    const s = scripted({ status: 200, body: MC }, ...svcReplies);
    const svc = new LaerligTaskService({ call: s.call, subject: "historie", h5Submissions: h5 });
    await svc.fetchTask(Q);
    return { s, svc };
  }

  it("off by default: the legacy body, no round_no, no submission_id", async () => {
    const { s, svc } = await served([{ status: 200, body: { status: "correct", correct_answer: "9. april 1940" } }], false);
    await svc.submit({ instanceId: ID, roundNo: 1, submissionId: SUB, action: { kind: "choice", payload: { optionId: "o1" } } });
    expect(Object.keys(s.calls[1]?.body ?? {}).sort()).toEqual(["answer", "question_instance_id", "question_shown_at"]);
  });

  it("on: the host's round and submission id go to the _v2 path; recorded and replay are the only successes", async () => {
    const { s, svc } = await served([{ status: 200, body: recorded }, { status: 200, body: { ...recorded, outcome: "replay" } }]);
    const a = { instanceId: ID, roundNo: 1, submissionId: SUB, action: { kind: "choice", payload: { optionId: "o1" } } } as const;
    expect(await svc.submit(a)).toMatchObject({ outcome: "correct", replay: false, evidence: "none" });
    expect(s.calls[1]?.body).toMatchObject({ round_no: 1, submission_id: SUB, answer: "9. april 1940" });
    expect(await svc.submit(a)).toMatchObject({ outcome: "correct", replay: true });
  });

  it("on: refused rounds (409), a reply for another round, or an unknown outcome are never successes", async () => {
    const a = { instanceId: ID, roundNo: 1, submissionId: SUB, action: { kind: "choice", payload: { optionId: "o1" } } } as const;
    for (const [reply, code] of [
      [{ status: 409, body: { outcome: "round_closed", error: "Round already closed" } }, "unavailable"],
      [{ status: 409, body: { outcome: "submission_conflict", error: "Submission id already used" } }, "unavailable"],
      [{ status: 200, body: { ...recorded, round_no: 2 } }, "server"],
      [{ status: 200, body: { ...recorded, outcome: "something" } }, "server"],
    ] as const) {
      const { svc } = await served([reply]);
      await expect(svc.submit(a)).rejects.toMatchObject({ code });
    }
    const { svc } = await served([]);
    await expect(svc.submit({ ...a, roundNo: 2 })).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("LaerligTaskService — option_details, D-332 (mock HTTP)", () => {
  it("passes the server's per-option descriptions through as the documents' backs; absent stays absent", async () => {
    const withDetails = { ...MC, content: { ...MC.content, option_details: ["Afsender: a|Tid: b", "Afsender: c|Tid: d", "Afsender: e|Tid: f"] } };
    const t = await new LaerligTaskService({ call: scripted({ status: 200, body: withDetails }).call, subject: "historie" }).fetchTask(Q);
    expect(t.options?.map((o) => o.detail)).toEqual(["Afsender: a|Tid: b", "Afsender: c|Tid: d", "Afsender: e|Tid: f"]);
    const plain = await new LaerligTaskService({ call: scripted({ status: 200, body: MC }).call, subject: "historie" }).fetchTask(Q);
    expect(plain.options?.every((o) => !("detail" in o))).toBe(true);
  });

  it("malformed descriptions (wrong count, non-text, too long) refuse the task instead of misaligning backs and options", async () => {
    for (const bad of [["one"], [1, 2, 3], ["a", "b", "c".repeat(401)], "x"]) {
      const body = { ...MC, content: { ...MC.content, option_details: bad } };
      await expect(new LaerligTaskService({ call: scripted({ status: 200, body }).call, subject: "historie" }).fetchTask(Q), JSON.stringify(bad)).rejects.toMatchObject({ code: "server" });
    }
  });
});

describe("LaerligTaskService — server-directed sequence, D-338 (mock HTTP)", () => {
  const MAP = { "hist.besaettelsen.h4": "world_war_2" } as const;
  const CTX = { guided_practice: "arkivskab", revision: "arkivskab-revision", independent_application: "skuffe", transfer: "overfoersel", revisit: "genbesoeg" };
  const svc = (reply: { status: number; body: unknown } | Error) => {
    const s = scripted(reply);
    return { s, svc: new LaerligTaskService({ call: s.call, subject: "historie", objectiveMap: MAP, sequence: { contextOfStep: CTX } }) };
  };

  it("asks for the sequence; the SERVER's step becomes the world's activity and the server's mode the task's mode", async () => {
    const { s, svc: a } = svc({ status: 200, body: { ...MC, learning_objective: "world_war_2", learning_step: "revision", mode: "practice" } });
    const t = await a.fetchTask({ ...Q, contextKey: "overfoersel" });
    expect(s.calls[0]?.body).toEqual({ subject: "historie", learning_objective: "world_war_2", sequence: true });
    expect(t).toMatchObject({ contextKey: "arkivskab-revision", mode: "practice" });
  });

  it("a reply without a known step and mode is not a sequence reply; waiting and complete are explicit", async () => {
    for (const body of [
      { ...MC, learning_objective: "world_war_2" },
      { ...MC, learning_objective: "world_war_2", learning_step: "mastery", mode: "practice" },
      { ...MC, learning_objective: "world_war_2", learning_step: "transfer", mode: "quiz_v1" },
    ]) await expect(svc({ status: 200, body }).svc.fetchTask(Q)).rejects.toMatchObject({ code: "unavailable", message: "the server did not confirm a known learning step" });
    const w = svc({ status: 200, body: { step: "sequence_waiting", learning_step: "revisit", due_at: "2026-11-05T04:00:00.000Z" } });
    await expect(w.svc.fetchTask(Q)).rejects.toMatchObject({ message: "sequence_waiting until 2026-11-05T04:00:00.000Z" });
    expect(w.svc.lastSequence).toEqual({ state: "sequence_waiting", step: "revisit", dueAt: "2026-11-05T04:00:00.000Z" });
    await expect(svc({ status: 200, body: { step: "sequence_complete" } }).svc.fetchTask(Q)).rejects.toMatchObject({ message: "sequence_complete" });
    await expect(svc({ status: 409, body: { error: "learning_step_not_current" } }).svc.fetchTask(Q)).rejects.toMatchObject({ code: "unavailable", transient: false });
  });

  it("a sequence without an objective map is refused before any request", async () => {
    const s = scripted();
    const a = new LaerligTaskService({ call: s.call, subject: "historie", sequence: { contextOfStep: CTX } });
    await expect(a.fetchTask(Q)).rejects.toMatchObject({ code: "unavailable" });
    expect(s.calls).toEqual([]);
  });
});
