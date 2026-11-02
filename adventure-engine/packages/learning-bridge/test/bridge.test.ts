import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BridgeError } from "../src/client.ts";
import { MAX_MESSAGE_BYTES, PROTOCOL, parseGameMessage, type TaskResultMsg } from "../src/protocol.ts";
import type { ServiceResult, ServiceTask, Submission, TaskQuery } from "../src/service.ts";
import { FakeTaskService } from "../src/test-service.ts";
import { GAME_ORIGIN, ITEMS, MemoryStore, flush, pair } from "./harness.ts";

const CHECK = { objectiveId: "hist.besaettelsen.h4", purpose: "check", surface: "world", contextKey: "arkivskab" } as const;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

async function connected(over: Parameters<typeof pair>[0] = {}) {
  const p = pair(over);
  const open = p.client.connect();
  await flush();
  return { ...p, open: await open };
}

describe("bridge/2 — the happy path (D-306)", () => {
  it("handshake → task → committed action → server verdict, with one reward", async () => {
    const p = await connected();
    expect(p.open).toBeNull();
    expect(p.client.status).toBe("ready");

    const present = p.client.requestTask(CHECK);
    await flush();
    const task = await present;
    expect(task.kind).toBe("choice");
    expect(task.mode).toBe("check");
    expect(task.stimulus.options?.map((o) => o.id)).toEqual(["opt_a", "opt_b", "opt_c", "opt_d"]);

    const verdict = p.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "opt_a" } });
    await flush();
    const r = await verdict;
    expect(r.outcome).toBe("correct");
    expect(r.evidence).toBe("evidence");
    expect(r.feedback.correctAnswer).toBe("Proklamationen fra kongen og regeringen");
    expect(p.service.ledger).toEqual([{ instanceId: "inst-1", xp: 10, coins: 5 }]);
  });

  it("a wrong answer is graded incorrect, pays nothing and reveals the answer only after closing", async () => {
    const p = await connected();
    const t = p.client.requestTask(CHECK);
    await flush();
    const task = await t;
    const r = p.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "opt_d" } });
    await flush();
    expect((await r).outcome).toBe("incorrect");
    expect(p.service.ledger).toEqual([]);
  });

  it("short_text keeps æ, ø and å: 'københavn' is right, 'kobenhavn' is not", async () => {
    for (const [text, outcome] of [[" københavn ", "correct"], ["Kobenhavn", "incorrect"]] as const) {
      const p = await connected();
      const t = p.client.requestTask({ ...CHECK, objectiveId: "hist.besaettelsen.h2" });
      await flush();
      const task = await t;
      expect(task.stimulus.options).toBeNull();
      const r = p.client.act(task.instanceToken, { kind: "short_text", payload: { text } });
      await flush();
      expect((await r).outcome).toBe(outcome);
    }
  });

  it("order is graded on the server's sequence", async () => {
    const p = await connected();
    const t = p.client.requestTask({ ...CHECK, objectiveId: "hist.besaettelsen.h2.orden", purpose: "practice" });
    await flush();
    const task = await t;
    const r = p.client.act(task.instanceToken, { kind: "order", payload: { order: ["ev_1", "ev_2", "ev_3"] } });
    await flush();
    const res = await r;
    expect(res.outcome).toBe("correct");
    expect(res.evidence).toBe("practice"); // practice mode never counts as evidence (LP-5)
  });
});

describe("bridge/2 — help and evidence are the server's (D-277 / LP-5)", () => {
  it("a hint is logged on the server, so a correct answer after it is practice, not evidence", async () => {
    const p = await connected();
    const t = p.client.requestTask(CHECK);
    await flush();
    const task = await t;
    expect(task.hintsAvailable).toBe(3);
    const h = p.client.hint(task.instanceToken, 1);
    await flush();
    expect((await h).text).toBe("Hvem bestemte, hvad befolkningen skulle gøre?");
    expect(p.service.instance("inst-1")?.hintsUsed).toBe(1);
    const r = p.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "opt_a" } });
    await flush();
    const res = await r;
    expect(res.outcome).toBe("correct");
    expect(res.evidence).toBe("practice");
  });

  it("the game cannot claim 'no help': there is no such field, and an extra field is rejected", () => {
    const base = { protocol: PROTOCOL, type: "task.action", nonce: "n1", requestId: "q1", instanceToken: "t1", action: { kind: "choice", payload: { optionId: "opt_a" } }, clientSeq: 1 };
    expect(parseGameMessage(base).ok).toBe(true);
    for (const extra of [{ hintsUsed: 0 }, { evidence: "evidence" }, { xp: 100 }, { coins: 50 }, { mastery: "mestret" }, { correct: true }]) {
      expect(parseGameMessage({ ...base, ...extra }).ok).toBe(false);
    }
    expect(parseGameMessage({ ...base, action: { kind: "choice", payload: { optionId: "opt_a", correct: true } } }).ok).toBe(false);
  });

  it("a hint beyond what the instance offers, or after closing, is refused", async () => {
    const p = await connected();
    const t = p.client.requestTask({ ...CHECK, objectiveId: "hist.besaettelsen.h2" });
    await flush();
    const task = await t;
    const h = p.client.hint(task.instanceToken, 1);
    await flush();
    await expect(h).rejects.toMatchObject({ code: "hint_unavailable" });
  });
});

describe("bridge/2 — sender, origin and payload checks", () => {
  it("drops messages from another origin or another window without touching the backend", async () => {
    const p = await connected();
    const nonce = p.host.sessionNonce as string;
    const msg = { protocol: PROTOCOL, type: "task.request", nonce, requestId: "evil1", ...CHECK };
    await p.rawToHost(msg, "https://evil.example");
    await p.rawToHost(msg, GAME_ORIGIN, { window: "other" });
    await flush();
    expect(p.hostRejects).toEqual(["origin", "source"]);
    expect(p.service.calls).toEqual(["openTask"]);
  });

  it("drops a message with a stale or forged nonce", async () => {
    const p = await connected();
    await p.rawToHost({ protocol: PROTOCOL, type: "task.request", nonce: "forged", requestId: "x1", ...CHECK });
    expect(p.hostRejects).toEqual(["nonce"]);
    expect(p.service.calls).toEqual(["openTask"]);
  });

  it("answers malformed, oversized or unknown messages with invalid_message and never calls the backend", async () => {
    const p = await connected();
    const nonce = p.host.sessionNonce as string;
    const before = p.toGame.length;
    const bad: unknown[] = [
      { protocol: PROTOCOL, type: "reward.grant", nonce, requestId: "a1", xp: 1000 },
      { protocol: PROTOCOL, type: "task.action", nonce, requestId: "a2", instanceToken: "t", action: { kind: "choice", payload: { optionId: "../../x" } }, clientSeq: 1 },
      { protocol: PROTOCOL, type: "task.action", nonce, requestId: "a3", instanceToken: "t", action: { kind: "order", payload: { order: ["a", "a"] } }, clientSeq: 1 },
      { protocol: PROTOCOL, type: "task.action", nonce, requestId: "a4", instanceToken: "t", action: { kind: "short_text", payload: { text: "x".repeat(MAX_MESSAGE_BYTES) } }, clientSeq: 1 },
      { protocol: PROTOCOL, type: "task.request", nonce, requestId: "a5", ...CHECK, purpose: "grant_mastery" },
      { protocol: "other/1", type: "task.request", nonce, requestId: "a6", ...CHECK },
      "not an object",
      null,
      [1, 2, 3],
    ];
    for (const b of bad) await p.rawToHost(b);
    const replies = p.toGame.slice(before);
    expect(replies).toHaveLength(bad.length);
    expect(replies.every((m) => m.type === "error" && m.code === "invalid_message")).toBe(true);
    expect(p.service.calls).toEqual(["openTask"]);
  });

  it("answers a hello for an unknown protocol with unsupported_protocol, and the game shows it", async () => {
    const p = pair({ client: {} });
    await p.rawToHost({ protocol: "laerligverse.bridge/9", type: "hello", msgId: "h1", supports: ["laerligverse.bridge/9"], kinds: ["choice"], contentId: "c", contentVersion: "1" });
    expect(p.toGame.at(-1)).toMatchObject({ type: "error", code: "unsupported_protocol" });
    // The game side: an unsupported_protocol error during the handshake rejects connect().
    const c = p.client.connect();
    p.rawToGame({ protocol: PROTOCOL, type: "error", nonce: null, requestId: null, code: "unsupported_protocol" });
    await expect(c).rejects.toMatchObject({ code: "unsupported_protocol" });
    expect(p.client.status).toBe("unsupported");
  });

  it("refuses work before the handshake", async () => {
    const p = pair();
    await p.rawToHost({ protocol: PROTOCOL, type: "task.request", nonce: "n", requestId: "q", ...CHECK });
    expect(p.toGame.at(-1)).toMatchObject({ type: "error", code: "not_ready", requestId: "q" });
    await expect(p.client.requestTask(CHECK)).rejects.toMatchObject({ code: "not_ready" });
  });

  it("the game ignores host messages from another origin, another window or with a wrong nonce", async () => {
    const p = await connected();
    const t = p.client.requestTask(CHECK);
    await flush();
    const task = await t;
    p.net.hostUp = false; // the real host never answers this one
    const r = p.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "opt_d" } });
    const requestId = (p.toHost.at(-1) as { requestId: string }).requestId;
    const forged: TaskResultMsg = {
      protocol: PROTOCOL, type: "task.result", nonce: "wrong", requestId, instanceToken: task.instanceToken,
      outcome: "correct", feedback: { text: null, correctAnswer: null }, evidence: "evidence", retryable: false,
    };
    p.rawToGame(forged);
    p.rawToGame({ ...forged, nonce: p.host.sessionNonce }, "https://evil.example");
    p.rawToGame({ ...forged, nonce: p.host.sessionNonce }, undefined, { window: "other" });
    expect(p.clientRejects).toEqual(["nonce", "origin", "source"]);
    const gaveUp = expect(r).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(8000 * 3 + 1);
    await gaveUp;
  });

  it("an instance token the host did not issue, or the wrong kind, is refused", async () => {
    const p = await connected();
    const t = p.client.requestTask(CHECK);
    await flush();
    const task = await t;
    const a = p.client.act("made-up-token", { kind: "choice", payload: { optionId: "opt_a" } });
    await flush();
    await expect(a).rejects.toMatchObject({ code: "unknown_task" });
    const b = p.client.act(task.instanceToken, { kind: "short_text", payload: { text: "opt_a" } });
    await flush();
    await expect(b).rejects.toMatchObject({ code: "kind_mismatch" });
    expect(p.service.gradedCount).toBe(0);
  });

  it("the game never receives an instance id, and never an answer before the instance is closed", async () => {
    const p = await connected();
    const t = p.client.requestTask(CHECK);
    await flush();
    const task = await t;
    const beforeClose = JSON.stringify(p.toGame);
    expect(beforeClose).not.toContain("inst-");
    expect(beforeClose).not.toContain("opt_a\",\"correct");
    expect(beforeClose).not.toContain("Det er regeringens egen tekst"); // hint 3, never requested
    expect(beforeClose).not.toContain("correctAnswer\":\"Proklamationen");
    const r = p.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "opt_b" } });
    await flush();
    await r;
    expect(JSON.stringify(p.toGame)).not.toContain("inst-");
  });
});

describe("bridge/2 — a repeat is a NEW round of the same instance (D-211/D-266)", () => {
  /** Serves the same server instance again in round 2, as get-next-question does after a repeat reopens it. */
  class Reopening extends FakeTaskService {
    readonly submits: Array<{ instanceId: string; roundNo: number; optionId: string }> = [];
    private first: ServiceTask | null = null;
    override async fetchTask(q: TaskQuery): Promise<ServiceTask> {
      if (this.first === null) {
        this.first = await super.fetchTask(q);
        return this.first;
      }
      return { ...this.first, roundNo: this.first.roundNo + 1 };
    }
    override async submit(s: Submission): Promise<ServiceResult> {
      this.submits.push({ instanceId: s.instanceId, roundNo: s.roundNo, optionId: s.action.kind === "choice" ? s.action.payload.optionId : "" });
      if (s.roundNo > 1) return { outcome: "correct", feedbackText: "Gentagelse.", correctAnswer: null, evidence: "practice", replay: false };
      return super.submit(s);
    }
  }

  it("round 2 gets its own token and its own submission; round 1's stored verdict never answers for it", async () => {
    const service = new Reopening(ITEMS);
    const p = await connected({ service });
    const first = p.client.requestTask(CHECK);
    await flush();
    const t1 = await first;
    const a1 = p.client.act(t1.instanceToken, { kind: "choice", payload: { optionId: "opt_a" } });
    await flush();
    expect((await a1).outcome).toBe("correct");
    const second = p.client.requestTask(CHECK);
    await flush();
    const t2 = await second;
    expect(t2.instanceToken).not.toBe(t1.instanceToken);
    const a2 = p.client.act(t2.instanceToken, { kind: "choice", payload: { optionId: "opt_a" } });
    await flush();
    expect((await a2).feedback.text).toBe("Gentagelse.");
    expect(service.submits.map((s) => s.roundNo)).toEqual([1, 2]);
    expect(new Set(service.submits.map((s) => s.instanceId)).size).toBe(1);
  });

  it("a pending submission stored for round 1 (or under the old instance-only key) is never resent as round 2's answer", async () => {
    const store = new MemoryStore();
    const service = new Reopening(ITEMS);
    const p = await connected({ service, host: { store } });
    const first = p.client.requestTask(CHECK);
    await flush();
    await first;
    // Stale entries from round 1: a WRONG answer under the instance-only key and under round 1's key.
    const stale = JSON.stringify({ submissionId: "old", roundNo: 1, action: { kind: "choice", payload: { optionId: "opt_b" } } });
    store.map.set("lvb2:pending:inst-1", stale);
    store.map.set("lvb2:pending:inst-1#1", stale);
    const second = p.client.requestTask(CHECK);
    await flush();
    const t2 = await second;
    const a2 = p.client.act(t2.instanceToken, { kind: "choice", payload: { optionId: "opt_a" } });
    await flush();
    await a2;
    expect(service.submits).toEqual([{ instanceId: "inst-1", roundNo: 2, optionId: "opt_a" }]);
  });
});

describe("bridge/2 — duplicates and idempotency", () => {
  it("the same task.action replayed many times is graded once and pays once", async () => {
    const p = await connected();
    const t = p.client.requestTask(CHECK);
    await flush();
    const task = await t;
    const msg = { protocol: PROTOCOL, type: "task.action", nonce: p.host.sessionNonce, requestId: "dup1", instanceToken: task.instanceToken, action: { kind: "choice", payload: { optionId: "opt_a" } }, clientSeq: 9 };
    await Promise.all(Array.from({ length: 6 }, () => p.rawToHost(msg)));
    await flush();
    for (let i = 0; i < 3; i++) await p.rawToHost(msg);
    expect(p.service.gradedCount).toBe(1);
    expect(p.service.ledger).toHaveLength(1);
    const results = p.toGame.filter((m) => m.type === "task.result");
    expect(results.length).toBeGreaterThanOrEqual(4);
    expect(new Set(results.map((m) => (m as TaskResultMsg).outcome))).toEqual(new Set(["correct"]));
  });

  it("a second commit with a new request id after closing returns the stored verdict, not a new grading", async () => {
    const p = await connected();
    const t = p.client.requestTask(CHECK);
    await flush();
    const task = await t;
    const a = p.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "opt_a" } });
    await flush();
    await a;
    const b = p.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "opt_b" } });
    await flush();
    expect((await b).outcome).toBe("correct");
    expect(p.service.gradedCount).toBe(1);
    expect(p.service.coins).toBe(5);
  });

  it("two commits racing for the same instance share one submission", async () => {
    const p = await connected();
    const t = p.client.requestTask(CHECK);
    await flush();
    const task = await t;
    const [a, b] = [
      p.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "opt_a" } }),
      p.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "opt_a" } }),
    ];
    await flush(40);
    expect((await a).outcome).toBe("correct");
    expect((await b).outcome).toBe("correct");
    expect(p.service.gradedCount).toBe(1);
    expect(p.service.ledger).toHaveLength(1);
  });

  it("a lost reply is recovered by resending the same request id; the host answers from memory", async () => {
    const p = await connected();
    const t = p.client.requestTask(CHECK);
    await flush();
    const task = await t;
    p.net.dropToGame = 2; // the ack and the verdict are lost
    const r = p.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "opt_a" } });
    await flush();
    expect(p.client.status).toBe("waiting");
    await vi.advanceTimersByTimeAsync(8000);
    const res = await r;
    expect(res.outcome).toBe("correct");
    const sent = p.toHost.filter((m) => m.type === "task.action");
    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual(sent[1]);
    expect(p.service.gradedCount).toBe(1);
  });
});

describe("bridge/2 — network failures, waiting and resumption", () => {
  it("retries a transient backend failure with the same submission id, telling the game it is retrying", async () => {
    const service = new FakeTaskService(ITEMS);
    const spy = vi.spyOn(service, "submit");
    const p = await connected({ service });
    const t = p.client.requestTask(CHECK);
    await flush();
    const task = await t;
    service.injectFailures("network", "server");
    const r = p.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "opt_a" } });
    await flush();
    expect(p.toGame.some((m) => m.type === "ack" && m.state === "retrying")).toBe(true);
    await vi.advanceTimersByTimeAsync(500 + 1500);
    expect((await r).outcome).toBe("correct");
    const ids = spy.mock.calls.map((c) => c[0].submissionId);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(1);
    expect(p.statuses).toContain("retrying");
    expect(service.ledger).toHaveLength(1);
  });

  it("a backend call that never answers times out and is retried", async () => {
    const service = new FakeTaskService(ITEMS);
    const p = await connected({ service, host: { callTimeoutMs: 1000 } });
    const t = p.client.requestTask(CHECK);
    await flush();
    const task = await t;
    service.injectFailures("hang");
    const r = p.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "opt_a" } });
    await vi.advanceTimersByTimeAsync(1000 + 500);
    expect((await r).outcome).toBe("correct");
  });

  it("when every retry fails the game gets 'aborted, retryable'; the next commit resends the ORIGINAL answer once", async () => {
    const service = new FakeTaskService(ITEMS);
    const spy = vi.spyOn(service, "submit");
    const p = await connected({ service });
    const t = p.client.requestTask(CHECK);
    await flush();
    const task = await t;
    service.injectFailures("network", "network", "network", "network");
    const r = p.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "opt_a" } });
    await vi.advanceTimersByTimeAsync(500 + 1500 + 4000);
    const first = await r;
    expect(first).toMatchObject({ outcome: "aborted", retryable: true, evidence: "none" });
    expect(service.gradedCount).toBe(0);
    // "Prøv igen": the committed answer is final, so a different payload does not replace it.
    const again = p.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "opt_d" } });
    await flush();
    expect((await again).outcome).toBe("correct");
    const subs = spy.mock.calls.map((c) => c[0]);
    expect(new Set(subs.map((s) => s.submissionId)).size).toBe(1);
    expect(subs.at(-1)?.action).toEqual({ kind: "choice", payload: { optionId: "opt_a" } });
    expect(service.ledger).toHaveLength(1);
  });

  it("a permanent refusal (forbidden) is an error, not a retry, and clears the pending submission", async () => {
    const service = new FakeTaskService(ITEMS);
    const store = new MemoryStore();
    const p = await connected({ service, store });
    const t = p.client.requestTask(CHECK);
    await flush();
    const task = await t;
    service.injectFailures("forbidden");
    const r = p.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "opt_a" } });
    await flush();
    await expect(r).rejects.toMatchObject({ code: "unknown_task" });
    expect(store.map.size).toBe(0);
  });

  it("a backend failure while fetching a task is reported, not swallowed", async () => {
    const service = new FakeTaskService(ITEMS);
    const p = await connected({ service });
    const bad = p.client.requestTask({ ...CHECK, objectiveId: "no.such.objective" });
    await flush();
    await expect(bad).rejects.toMatchObject({ code: "task_unavailable" });
  });

  it("the game gives up and goes offline when the host is gone", async () => {
    const p = await connected();
    p.net.hostUp = false;
    const t = p.client.requestTask(CHECK);
    const gaveUp = expect(t).rejects.toBeInstanceOf(BridgeError);
    await vi.advanceTimersByTimeAsync(8000 * 3 + 1);
    await gaveUp;
    expect(p.client.status).toBe("offline");
  });

  it("connect() keeps saying hello until the host listens, then gives up after the limit", async () => {
    const p = pair({ client: { helloAttempts: 3, helloIntervalMs: 100 } });
    p.net.hostUp = false;
    const c = p.client.connect();
    const gaveUp = expect(c).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(100 * 3 + 1);
    await gaveUp;
    expect(p.toHost.filter((m) => m.type === "hello")).toHaveLength(3);
  });

  it("resumes an open instance after the game reloads: same token, old session's messages are dead", async () => {
    const p = await connected();
    const t = p.client.requestTask(CHECK);
    await flush();
    const task = await t;
    const oldNonce = p.host.sessionNonce;
    // The iframe reloads: the game says hello again and gets a new session.
    const open = p.client.connect();
    await flush();
    const resumed = await open;
    expect(p.host.sessionNonce).not.toBe(oldNonce);
    expect(resumed?.instanceToken).toBe(task.instanceToken);
    await p.rawToHost({ protocol: PROTOCOL, type: "task.action", nonce: oldNonce, requestId: "old1", instanceToken: task.instanceToken, action: { kind: "choice", payload: { optionId: "opt_a" } }, clientSeq: 1 });
    expect(p.hostRejects).toContain("nonce");
    expect(p.service.gradedCount).toBe(0);
  });

  it("init.openTask carries the server's open instance so the scene can resume it", async () => {
    const service = new FakeTaskService(ITEMS);
    const first = await connected({ service });
    const t = first.client.requestTask(CHECK);
    await flush();
    const task = await t;
    const second = await connected({ service, store: first.store });
    expect(second.open).toMatchObject({ kind: "choice", contextKey: "arkivskab", mode: "check" });
    const r = second.client.act((second.open as { instanceToken: string }).instanceToken, { kind: "choice", payload: { optionId: "opt_a" } });
    await flush();
    expect((await r).outcome).toBe("correct");
    expect(task.instanceToken).toBeTruthy();
    expect(service.ledger).toHaveLength(1);
  });

  it("a host reload keeps a pending submission (sessionStorage) and resends it unchanged", async () => {
    const service = new FakeTaskService(ITEMS);
    const spy = vi.spyOn(service, "submit");
    const store = new MemoryStore();
    const p = await connected({ service, store });
    const t = p.client.requestTask(CHECK);
    await flush();
    const task = await t;
    service.injectFailures("network", "network", "network", "network");
    const r = p.client.act(task.instanceToken, { kind: "choice", payload: { optionId: "opt_a" } });
    await vi.advanceTimersByTimeAsync(6000);
    expect((await r).outcome).toBe("aborted");
    expect(store.map.size).toBe(1);
    // The host page reloads; the game reconnects and resumes the open instance.
    p.reloadHost();
    const open = p.client.connect();
    await flush();
    const resumed = await open;
    expect(resumed).not.toBeNull();
    const again = p.client.act((resumed as { instanceToken: string }).instanceToken, { kind: "choice", payload: { optionId: "opt_c" } });
    await flush();
    expect((await again).outcome).toBe("correct");
    expect(new Set(spy.mock.calls.map((c) => c[0].submissionId)).size).toBe(1);
    expect(store.map.size).toBe(0);
    expect(service.ledger).toHaveLength(1);
  });
});
