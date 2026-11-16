import { afterEach, describe, expect, it } from "vitest";
import { BridgeHost } from "../src/host.ts";
import { LaerligTaskService, type EdgeCaller } from "../src/laerlig-service.ts";
import {
  MAX_INTRO_CARDS,
  MAX_MESSAGE_BYTES,
  PROTOCOL,
  PROTOCOL_V2,
  negotiate,
  parseGameMessage,
  parseHostMessage,
  type HostMessage,
  type IntroPresentMsg,
} from "../src/protocol.ts";
import { ServiceError, type IntroductionReport, type ServiceIntroduction, type ServiceTask, type TaskQuery } from "../src/service.ts";
import { FakeTaskService } from "../src/test-service.ts";
import { ITEMS, MemoryStore, flush, pair } from "./harness.ts";

/**
 * F11-B — the server-directed introduction over bridge/3. The fake backend below mimics the SERVER's contract
 * (introduction_rounds: presented/completed set once, the first request id wins, a repeat changes nothing); the real
 * server is proven in tests/isolated/laerligverse-intro-visible.isolated.spec.mjs and the PGlite/PG17 suites of #664.
 */

const ROUND = "11111111-2222-4333-8444-555555555555";
const CARDS = [
  { title: "Morgenen den 9. april 1940", text: "Tidligt om morgenen gik tyske soldater over grænsen." },
  { title: "Sådan spørger man en kilde", text: "Hvem har lavet den? Hvornår? Til hvem? Og hvorfor?" },
];
const CHECK = { objectiveId: "hist.besaettelsen.h4", purpose: "check", surface: "world", contextKey: "arkivskab" } as const;

/** A backend with ONE introduction round in front of the task sequence, behaving like the server. */
class IntroService extends FakeTaskService {
  cards: ReadonlyArray<{ title: string; text: string }> = CARDS;
  presentedBy: string | null = null;
  completedBy: string | null = null;
  readonly reports: IntroductionReport[] = [];
  readonly failReports: ServiceError[] = [];
  steps = 0;
  constructor() {
    super(ITEMS);
  }
  private intro(q: TaskQuery): ServiceIntroduction {
    return { step: "introduction", roundId: ROUND, contentSha256: "a".repeat(64), objective: "test_obj", contextKey: q.contextKey, cards: this.cards };
  }
  async fetchStep(q: TaskQuery): Promise<ServiceTask | ServiceIntroduction> {
    this.steps++;
    if (this.completedBy === null) return this.intro(q);
    return super.fetchTask(q);
  }
  /** What LaerligTaskService.fetchTask does when the server chose an introduction: refuse it, never skip it. */
  override async fetchTask(q: TaskQuery): Promise<ServiceTask> {
    if (this.completedBy === null) throw new ServiceError("unavailable", false, "the server chose an introduction, which this game does not show");
    return super.fetchTask(q);
  }
  async reportIntroduction(r: IntroductionReport): Promise<"recorded"> {
    this.reports.push(r);
    const f = this.failReports.shift();
    if (f !== undefined) throw f;
    if (r.roundId !== ROUND) throw new ServiceError("not_found", false);
    if (r.event === "shown" && this.presentedBy === null) this.presentedBy = r.requestId;
    if (r.event === "done" && this.completedBy === null) this.completedBy = r.requestId;
    return "recorded";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function introPair(over: Parameters<typeof pair>[0] = {}) {
  const service = new IntroService();
  const p = pair({ service, host: { retryDelaysMs: [0, 0, 0], ...over.host }, ...over, ...(over.client ? { client: over.client } : {}) });
  const c = p.client.connect();
  await flush();
  await c;
  return { ...p, svc: service };
}

async function introPresent(p: Awaited<ReturnType<typeof introPair>>): Promise<IntroPresentMsg> {
  const s = p.client.requestStep(CHECK);
  await flush();
  const step = await s;
  expect(step.type).toBe("intro.present");
  return step as IntroPresentMsg;
}

describe("bridge/3 protocol — introduction messages", () => {
  const present = { protocol: PROTOCOL, type: "intro.present", nonce: "n1", requestId: "q1", introToken: "t1", contextKey: "arkivskab", cards: CARDS };

  it("accepts a valid intro.present, intro.shown, intro.done and intro.recorded in bridge/3", () => {
    expect(parseHostMessage(present).ok).toBe(true);
    expect(parseHostMessage({ protocol: PROTOCOL, type: "intro.recorded", nonce: "n", requestId: "q", introToken: "t", event: "done" }).ok).toBe(true);
    for (const type of ["intro.shown", "intro.done"]) expect(parseGameMessage({ protocol: PROTOCOL, type, nonce: "n", requestId: "q", introToken: "t" }).ok).toBe(true);
  });

  it("refuses every introduction message in the bridge/2 envelope (an old game can never carry one)", () => {
    expect(parseHostMessage({ ...present, protocol: PROTOCOL_V2 })).toMatchObject({ ok: false, reason: expect.stringContaining("needs") });
    for (const type of ["intro.shown", "intro.done"]) expect(parseGameMessage({ protocol: PROTOCOL_V2, type, nonce: "n", requestId: "q", introToken: "t" }).ok).toBe(false);
  });

  it("refuses unknown versions, unknown types, missing or extra fields and malformed ids", () => {
    expect(parseHostMessage({ ...present, protocol: "laerligverse.bridge/9" }).ok).toBe(false);
    expect(parseGameMessage({ protocol: PROTOCOL, type: "intro.skip", nonce: "n", requestId: "q", introToken: "t" }).ok).toBe(false);
    expect(parseGameMessage({ protocol: PROTOCOL, type: "intro.done", requestId: "q", introToken: "t" }).ok).toBe(false); // no nonce
    expect(parseGameMessage({ protocol: PROTOCOL, type: "intro.done", nonce: "n", requestId: "q", introToken: "t", xp: 10 }).ok).toBe(false);
    expect(parseGameMessage({ protocol: PROTOCOL, type: "intro.done", nonce: "n", requestId: "q", introToken: "../x" }).ok).toBe(false);
    expect(parseHostMessage({ ...present, roundId: ROUND }).ok).toBe(false); // the round id has no field to travel in
    expect(parseHostMessage({ protocol: PROTOCOL, type: "intro.recorded", nonce: "n", requestId: "q", introToken: "t", event: "mastered" }).ok).toBe(false);
  });

  it("cards: 1–10 objects of exactly {title, text}, no blanks, no answer keys, bounded, and the whole message ≤ 8192 bytes", () => {
    expect(parseHostMessage({ ...present, cards: [] }).ok).toBe(false);
    expect(parseHostMessage({ ...present, cards: Array.from({ length: MAX_INTRO_CARDS + 1 }, () => CARDS[0]) }).ok).toBe(false);
    expect(parseHostMessage({ ...present, cards: [{ ...CARDS[0], correct: "9. april" }] }).ok).toBe(false);
    expect(parseHostMessage({ ...present, cards: [{ title: "x" }] }).ok).toBe(false);
    expect(parseHostMessage({ ...present, cards: [{ title: "  ", text: "x" }] }).ok).toBe(false);
    expect(parseHostMessage({ ...present, cards: [{ title: "x".repeat(121), text: "x" }] }).ok).toBe(false);
    expect(parseHostMessage({ ...present, cards: [{ title: "x", text: "x".repeat(1201) }] }).ok).toBe(false);
    const big = { ...present, cards: Array.from({ length: 8 }, () => ({ title: "æ".repeat(100), text: "ø".repeat(1000) })) };
    expect(new TextEncoder().encode(JSON.stringify(big)).length).toBeGreaterThan(MAX_MESSAGE_BYTES);
    expect(parseHostMessage(big)).toMatchObject({ ok: false, reason: "message too large" });
  });

  it("negotiation picks the newest common version, and nothing for an unknown one", () => {
    expect(negotiate([PROTOCOL, PROTOCOL_V2])).toBe(PROTOCOL);
    expect(negotiate([PROTOCOL_V2])).toBe(PROTOCOL_V2);
    expect(negotiate(["laerligverse.bridge/9"])).toBeNull();
  });
});

describe("bridge/3 host — the introduction chain", () => {
  it("serves the cards with an opaque token: no round id, hash or objective reaches the game", async () => {
    const p = await introPair();
    expect(p.host.sessionProtocol).toBe(PROTOCOL);
    const m = await introPresent(p);
    expect(m.cards).toEqual(CARDS);
    const seen = JSON.stringify(p.toGame);
    for (const secret of [ROUND, "a".repeat(64), "test_obj"]) expect(seen).not.toContain(secret);
    expect(p.svc.reports).toEqual([]); // serving reports nothing
  });

  it("shown → done → the next step is the task; each event reaches the server once with one stable id per event", async () => {
    const p = await introPair();
    const m = await introPresent(p);
    const s = p.client.introShown(m.introToken);
    await flush();
    expect(await s).toMatchObject({ type: "intro.recorded", event: "shown", introToken: m.introToken });
    // A second "shown" (another tab of the same game session, a double render): answered, no server call.
    const s2 = p.client.introShown(m.introToken);
    await flush();
    await s2;
    const d = p.client.introDone(m.introToken);
    await flush();
    expect(await d).toMatchObject({ type: "intro.recorded", event: "done" });
    expect(p.svc.reports.map((r) => r.event)).toEqual(["shown", "done"]);
    const [shown, done] = p.svc.reports;
    expect(shown?.requestId).not.toBe(done?.requestId);
    expect(p.store.map.get(`lvb3:intro:${ROUND}:shown`)).toBe(shown?.requestId);
    expect(p.store.map.get(`lvb3:intro:${ROUND}:done`)).toBe(done?.requestId);
    const next = p.client.requestStep(CHECK);
    await flush();
    expect((await next).type).toBe("task.present");
    expect(p.service.ledger).toEqual([]); // the introduction paid nothing
  });

  it("refuses done before shown, a foreign token and a token from an earlier game session", async () => {
    const p = await introPair();
    const m = await introPresent(p);
    const early = p.client.introDone(m.introToken);
    await flush();
    await expect(early).rejects.toMatchObject({ code: "invalid_message" });
    const foreign = p.client.introShown("not-a-token");
    await flush();
    await expect(foreign).rejects.toMatchObject({ code: "unknown_task" });
    expect(p.svc.reports).toEqual([]);
    // A reloaded game (new hello): the old token is dead; asking again resumes the SAME round under a new token.
    const c = p.client.connect();
    await flush();
    await c;
    const stale = p.client.introShown(m.introToken);
    await flush();
    await expect(stale).rejects.toMatchObject({ code: "unknown_task" });
    const again = await introPresent(p);
    expect(again.introToken).not.toBe(m.introToken);
    expect(again.cards).toEqual(CARDS);
  });

  it("a reloaded HOST page resends the same request id per event (the server answers a replay; its first time stays)", async () => {
    const p = await introPair();
    const m = await introPresent(p);
    const s = p.client.introShown(m.introToken);
    await flush();
    await s;
    const firstId = p.svc.reports[0]?.requestId;
    p.reloadHost();
    const c = p.client.connect();
    await flush();
    await c;
    const m2 = await introPresent(p);
    const s2 = p.client.introShown(m2.introToken);
    await flush();
    await s2;
    expect(p.svc.reports.map((r) => r.requestId)).toEqual([firstId, firstId]);
    expect(p.svc.presentedBy).toBe(firstId);
  });

  it("concurrent done reports make ONE server call; a transient failure is retried with the SAME id", async () => {
    const p = await introPair();
    const m = await introPresent(p);
    const s = p.client.introShown(m.introToken);
    await flush();
    await s;
    p.svc.failReports.push(new ServiceError("network", true));
    const d1 = p.client.introDone(m.introToken);
    const d2 = p.client.introDone(m.introToken);
    await sleep(30);
    await flush();
    await expect(Promise.all([d1, d2])).resolves.toHaveLength(2);
    const dones = p.svc.reports.filter((r) => r.event === "done");
    expect(dones).toHaveLength(2); // the failed attempt and its retry
    expect(new Set(dones.map((r) => r.requestId)).size).toBe(1);
  });

  it("an expired session is reported as session_expired and nothing is marked; a later retry completes", async () => {
    const p = await introPair();
    const m = await introPresent(p);
    const s = p.client.introShown(m.introToken);
    await flush();
    await s;
    p.svc.failReports.push(new ServiceError("unauthorized", false));
    const d = p.client.introDone(m.introToken);
    await flush();
    await expect(d).rejects.toMatchObject({ code: "session_expired" });
    expect(p.svc.completedBy).toBeNull();
    const again = p.client.introDone(m.introToken);
    await flush();
    await again;
    expect(p.svc.completedBy).not.toBeNull();
  });

  it("backend cards the protocol cannot carry become an explicit server_error, never a hanging request", async () => {
    const p = await introPair();
    p.svc.cards = Array.from({ length: 8 }, () => ({ title: "æ".repeat(100), text: "ø".repeat(1000) }));
    const s = p.client.requestStep(CHECK);
    await flush();
    await expect(s).rejects.toMatchObject({ code: "server_error" });
  });
});

describe("bridge/2 compatibility — an old (or non-introduction) game", () => {
  it("negotiates bridge/2, never receives an introduction (task_unavailable) and cannot report one", async () => {
    const p = await introPair({ client: { introductions: false } });
    expect(p.host.sessionProtocol).toBe(PROTOCOL_V2);
    expect(p.toHost[0]).toMatchObject({ protocol: PROTOCOL_V2, supports: [PROTOCOL_V2] });
    const t = p.client.requestTask(CHECK);
    await flush();
    await expect(t).rejects.toMatchObject({ code: "task_unavailable" });
    expect(p.toGame.some((m: HostMessage) => m.type === "intro.present")).toBe(false);
    await expect(p.client.introDone("x")).rejects.toMatchObject({ code: "unsupported_protocol" });
    // Forged reports: in the bridge/2 envelope they do not parse; in the bridge/3 envelope they break the session's version.
    const nonce = p.host.sessionNonce;
    await p.rawToHost({ protocol: PROTOCOL_V2, type: "intro.done", nonce, requestId: "f1", introToken: "x" });
    await p.rawToHost({ protocol: PROTOCOL, type: "intro.done", nonce, requestId: "f2", introToken: "x" });
    expect(p.hostRejects.filter((r) => r === "invalid")).toHaveLength(2);
    expect(p.svc.reports).toEqual([]);
    expect(p.svc.completedBy).toBeNull();
    // Both ends agree on the negotiated version; requestStep needs the explicit introductions option.
    expect(p.client.protocol).toBe(PROTOCOL_V2);
    await expect(p.client.requestStep(CHECK)).rejects.toMatchObject({ code: "unsupported_protocol" });
  });

  it("a backend that returns an introduction where a task is expected (bridge/2 session) is refused, reported, never shown", async () => {
    const errors: unknown[] = [];
    class LeakyService extends IntroService {
      override async fetchTask(q: TaskQuery): Promise<ServiceTask> {
        return (await this.fetchStep(q)) as ServiceTask; // a faulty adapter: lets the introduction through
      }
    }
    const service = new LeakyService();
    const p = pair({ service, client: { introductions: false }, host: { onServiceError: (e) => errors.push(e) } });
    const c = p.client.connect();
    await flush();
    await c;
    const t = p.client.requestTask(CHECK);
    await flush();
    await expect(t).rejects.toMatchObject({ code: "task_unavailable" });
    expect(String(errors.at(-1))).toMatch(/cannot show/);
    expect(p.toGame.some((m: HostMessage) => m.type === "intro.present")).toBe(false);
  });

  it("without a store the host keeps the report ids in memory: the same id for every retry of the same event", async () => {
    const service = new IntroService();
    // The harness passes a store by default; an explicit undefined removes it for this host.
    const p = pair({ service, host: { store: undefined, retryDelaysMs: [0, 0, 0] } as never });
    const c = p.client.connect();
    await flush();
    await c;
    expect(p.client.protocol).toBe(PROTOCOL);
    const s = p.client.requestStep(CHECK);
    await flush();
    const m = (await s) as IntroPresentMsg;
    service.failReports.push(new ServiceError("network", true));
    const shown = p.client.introShown(m.introToken);
    await sleep(20);
    await flush();
    await shown;
    expect(service.reports).toHaveLength(2);
    expect(service.reports[0]?.requestId).toBe(service.reports[1]?.requestId);
    expect(p.store.map.size).toBe(0);
  });

  it("a game that speaks only an unknown version is refused explicitly", async () => {
    const p = pair({ service: new IntroService() });
    await p.rawToHost({ protocol: PROTOCOL_V2, type: "hello", msgId: "h1", supports: ["laerligverse.bridge/9"], kinds: ["choice"], contentId: "a", contentVersion: "1" });
    expect(p.toGame.at(-1)).toMatchObject({ type: "error", code: "unsupported_protocol", protocol: PROTOCOL_V2 });
    expect(p.host.sessionProtocol).toBeNull();
  });

  it("an introduction-capable game still runs the ordinary task flow on a bridge/3 host", async () => {
    const p = pair({ service: new FakeTaskService(ITEMS) });
    const c = p.client.connect();
    await flush();
    await c;
    expect(p.host.sessionProtocol).toBe(PROTOCOL);
    const t = p.client.requestStep(CHECK);
    await flush();
    const task = await t;
    expect(task.type).toBe("task.present");
  });
});

describe("NEGATIVE CONTROL — the ordering guard test detects a deliberately removed guard", () => {
  const proto = BridgeHost.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const original = proto["introReport"] as (this: unknown, requestId: string, token: string, event: "shown" | "done") => Promise<void>;
  afterEach(() => {
    proto["introReport"] = original as never; // always restored
  });

  async function doneBeforeShownReachesServer(): Promise<boolean> {
    const p = await introPair();
    const m = await introPresent(p);
    const d = p.client.introDone(m.introToken);
    await flush();
    await d.catch(() => undefined);
    return p.svc.reports.some((r) => r.event === "done");
  }

  it("real host: done before shown never reaches the server", async () => {
    expect(await doneBeforeShownReachesServer()).toBe(false);
  });

  it("sabotaged host (guard removed): the same check catches it", async () => {
    proto["introReport"] = async function (this: { intros: Map<string, { shown: string }> }, requestId: string, token: string, event: "shown" | "done") {
      const e = this.intros.get(token);
      if (e !== undefined && event === "done") e.shown = "recorded"; // planted bug: pretends it was shown
      return original.call(this, requestId, token, event);
    } as never;
    expect(await doneBeforeShownReachesServer()).toBe(true);
  });
});

describe("LaerligTaskService — the server's introduction step (mock HTTP)", () => {
  const Q: TaskQuery = { objectiveId: "hist.besaettelsen.h4", purpose: "check", surface: "world", kinds: ["choice"], contextKey: "arkivskab" };
  const OBJ = "test_kildekritik_intro";
  const REPLY = { step: "introduction", learning_objective: OBJ, learning_step: "introduction", introduction_round_id: ROUND, content_sha256: "b".repeat(64), content: { cards: CARDS } };
  function svc(replies: Array<{ status: number; body: unknown } | Error>, introductions = true) {
    const calls: Array<{ fn: string; body: Record<string, unknown> }> = [];
    const call: EdgeCaller = async (fn, body) => {
      calls.push({ fn, body: { ...body } });
      const r = replies.shift();
      if (r === undefined) throw new Error("no scripted reply left");
      if (r instanceof Error) throw r;
      return r;
    };
    const s = new LaerligTaskService({ call, subject: "historie", objectiveMap: { "hist.besaettelsen.h4": OBJ }, sequence: { contextOfStep: { guided_practice: "arkivskab" } }, introductions });
    return { s, calls };
  }

  it("fetchStep returns a separate introduction (round id kept, cards in order); fetchTask refuses it explicitly", async () => {
    const a = svc([{ status: 200, body: REPLY }]);
    expect(await a.s.fetchStep(Q)).toEqual({ step: "introduction", roundId: ROUND, contentSha256: "b".repeat(64), objective: OBJ, contextKey: "arkivskab", cards: CARDS });
    const b = svc([{ status: 200, body: REPLY }]);
    await expect(b.s.fetchTask(Q)).rejects.toMatchObject({ code: "unavailable" });
    const off = svc([{ status: 200, body: REPLY }], false);
    await expect(off.s.fetchStep(Q)).rejects.toMatchObject({ code: "unavailable" });
  });

  it("refuses anything but the documented reply: answer keys, extra fields, wrong objective, bad ids, bad cards", async () => {
    const bad = [
      { ...REPLY, correct_answer: "x" },
      { ...REPLY, content: { cards: CARDS, accepted_answers: ["x"] } },
      { ...REPLY, content: { cards: [{ ...CARDS[0], correct: "x" }] } },
      { ...REPLY, learning_objective: "other_objective" },
      { ...REPLY, learning_step: "guided_practice" },
      { ...REPLY, introduction_round_id: "not-a-uuid" },
      { ...REPLY, content_sha256: "xyz" },
      { ...REPLY, content: { cards: [] } },
      { ...REPLY, content: { cards: Array.from({ length: 11 }, () => CARDS[0]) } },
      { ...REPLY, content: { cards: [{ title: "", text: "x" }] } },
      { ...REPLY, content: { cards: [{ title: "x", text: 3 }] } },
    ];
    for (const body of bad) {
      const a = svc([{ status: 200, body }]);
      await expect(a.s.fetchStep(Q), JSON.stringify(body).slice(0, 80)).rejects.toMatchObject({ code: "server" });
    }
  });

  it("reportIntroduction: shown → presented, done → completed, with the host's id; every server outcome mapped", async () => {
    const RID = "22222222-3333-4444-8555-666666666666";
    for (const outcome of ["recorded", "replay", "already_recorded", "already_completed"]) {
      const a = svc([{ status: 200, body: { outcome, at: "2026-11-16T10:00:00Z" } }]);
      expect(await a.s.reportIntroduction({ roundId: ROUND, event: "done", requestId: RID })).toBe("recorded");
      expect(a.calls[0]).toEqual({ fn: "introduction-progress", body: { action: "completed", round_id: ROUND, request_id: RID } });
    }
    const shown = svc([{ status: 200, body: { outcome: "recorded", at: "2026-11-16T10:00:00Z" } }]);
    await shown.s.reportIntroduction({ roundId: ROUND, event: "shown", requestId: RID });
    expect(shown.calls[0]?.body.action).toBe("presented");
    expect(await svc([{ status: 404, body: { outcome: "disabled", error: "Not enabled" } }]).s.reportIntroduction({ roundId: ROUND, event: "shown", requestId: RID })).toBe("not_recordable");
    await expect(svc([{ status: 404, body: { outcome: "disabled" } }]).s.reportIntroduction({ roundId: ROUND, event: "done", requestId: RID })).rejects.toMatchObject({ code: "unavailable" });
    await expect(svc([{ status: 404, body: { outcome: "not_found" } }]).s.reportIntroduction({ roundId: ROUND, event: "done", requestId: RID })).rejects.toMatchObject({ code: "not_found" });
    await expect(svc([{ status: 409, body: { outcome: "round_closed" } }]).s.reportIntroduction({ roundId: ROUND, event: "done", requestId: RID })).rejects.toMatchObject({ code: "unavailable", transient: false });
    await expect(svc([{ status: 401, body: {} }]).s.reportIntroduction({ roundId: ROUND, event: "done", requestId: RID })).rejects.toMatchObject({ code: "unauthorized" });
    await expect(svc([{ status: 503, body: {} }]).s.reportIntroduction({ roundId: ROUND, event: "done", requestId: RID })).rejects.toMatchObject({ code: "server", transient: true });
    await expect(svc([new TypeError("Failed to fetch")]).s.reportIntroduction({ roundId: ROUND, event: "done", requestId: RID })).rejects.toMatchObject({ code: "network", transient: true });
    await expect(svc([{ status: 200, body: { outcome: "recorded" } }]).s.reportIntroduction({ roundId: ROUND, event: "done", requestId: RID })).rejects.toMatchObject({ code: "server" });
    const none = svc([]);
    await expect(none.s.reportIntroduction({ roundId: "x", event: "done", requestId: RID })).rejects.toMatchObject({ code: "invalid" });
    await expect(none.s.reportIntroduction({ roundId: ROUND, event: "done", requestId: "r1" })).rejects.toMatchObject({ code: "invalid" });
    expect(none.calls).toEqual([]);
    await expect(svc([], false).s.reportIntroduction({ roundId: ROUND, event: "done", requestId: RID })).rejects.toMatchObject({ code: "unavailable" });
  });

  it("the host's own store keeps the request ids apart per round and event (MemoryStore round-trip)", () => {
    const store = new MemoryStore();
    store.setItem(`lvb3:intro:${ROUND}:shown`, "a");
    store.setItem(`lvb3:intro:${ROUND}:done`, "b");
    expect(store.getItem(`lvb3:intro:${ROUND}:shown`)).not.toBe(store.getItem(`lvb3:intro:${ROUND}:done`));
  });
});
