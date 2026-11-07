import {
  PROTOCOL,
  helloProtocols,
  parseGameMessage,
  parseHostMessage,
  type Action,
  type ErrorCode,
  type GameMessage,
  type HostMessage,
  type InboundEvent,
  type InteractionKind,
  type PresentBody,
  type RejectReason,
  type TaskResultMsg,
  INTERACTION_KINDS,
} from "./protocol.ts";
import { ServiceError, type ServiceTask, type TaskService } from "./service.ts";

/** Minimal storage (sessionStorage in the browser). Pending submissions survive a reload of the host page. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface BridgeHostOptions {
  /** The game's exact origin, fixed by configuration (never read from the game or the URL). */
  readonly gameOrigin: string;
  /** The game's window (`iframe.contentWindow`); `event.source` must be this object. */
  readonly gameWindow: unknown;
  /** Sends to the game; the browser wiring is `iframe.contentWindow.postMessage(msg, gameOrigin)`. */
  readonly post: (message: HostMessage) => void;
  readonly service: TaskService;
  /** Unpredictable id matching /^[A-Za-z0-9_-]{1,64}$/ (crypto.randomUUID in the browser). */
  readonly randomId: () => string;
  readonly store?: KeyValueStore;
  readonly timers?: Timers;
  /** Per backend call. Default 10 000 ms. */
  readonly callTimeoutMs?: number;
  /** Waits before the 2nd, 3rd … attempt of a transient failure. Default [500, 1500, 4000]. */
  readonly retryDelaysMs?: readonly number[];
  readonly onReject?: (reason: RejectReason, detail: string) => void;
  readonly onServiceError?: (error: unknown) => void;
}

interface Pending {
  readonly submissionId: string;
  readonly roundNo: number;
  readonly action: Action;
}

interface Entry {
  readonly token: string;
  readonly task: ServiceTask;
  result: Omit<TaskResultMsg, "requestId" | "nonce"> | null;
  /** Request ids of task.action messages waiting for the in-flight submission. */
  waiting: string[];
  submitting: boolean;
}

interface RequestState {
  done: HostMessage | null;
}

const MAX_REMEMBERED_REQUESTS = 500;
const PENDING_PREFIX = "lvb2:pending:";

class CallTimeout extends Error {}

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
};

/**
 * Host end of `laerligverse.bridge/2` (D-306). It lives on the Lærlig page that holds the pupil's session
 * and is the only party that talks to the backend. The game gets opaque tokens, whitelisted stimuli and
 * verdicts — never a session token, an instance id, an answer key or a way to grant itself anything.
 */
export class BridgeHost {
  private readonly o: Required<Omit<BridgeHostOptions, "store" | "onReject" | "onServiceError">> & BridgeHostOptions;
  private readonly timers: Timers;
  private nonce: string | null = null;
  private gen = 0;
  private kinds: readonly InteractionKind[] = [];
  private requests = new Map<string, RequestState>();
  private readonly tokens = new Map<string, Entry>();
  private readonly byInstance = new Map<string, string>();

  constructor(options: BridgeHostOptions) {
    this.o = { callTimeoutMs: 10_000, retryDelaysMs: [500, 1500, 4000], timers: defaultTimers, ...options };
    this.timers = this.o.timers;
  }

  /** The current session nonce (null before the first valid hello). For tests and diagnostics. */
  get sessionNonce(): string | null {
    return this.nonce;
  }

  /** Feed every `message` event of the host window here. Returns a promise for tests; callers may ignore it. */
  async onMessage(event: InboundEvent): Promise<void> {
    if (event.origin !== this.o.gameOrigin) return this.reject("origin", event.origin);
    if (event.source !== this.o.gameWindow) return this.reject("source", "unexpected window");

    const protocols = helloProtocols(event.data);
    if (protocols !== null && !protocols.includes(PROTOCOL)) {
      this.send({ protocol: PROTOCOL, type: "error", nonce: null, requestId: null, code: "unsupported_protocol" });
      return;
    }
    const parsed = parseGameMessage(event.data);
    if (!parsed.ok) {
      this.reject("invalid", parsed.reason);
      this.send({ protocol: PROTOCOL, type: "error", nonce: this.nonce, requestId: null, code: "invalid_message" });
      return;
    }
    const msg = parsed.value;
    if (msg.type === "hello") return this.hello(msg);

    if (this.nonce === null) {
      this.send({ protocol: PROTOCOL, type: "error", nonce: null, requestId: msg.requestId, code: "not_ready" });
      return;
    }
    if (msg.nonce !== this.nonce) return this.reject("nonce", msg.type);

    const known = this.requests.get(msg.requestId);
    if (known !== undefined) {
      // Duplicate (a resend after a lost reply, or a replayed message): answer again, never act again.
      if (known.done !== null) this.send(known.done);
      else this.ack(msg.requestId, "received");
      return;
    }
    this.remember(msg.requestId);

    switch (msg.type) {
      case "task.request":
        return this.taskRequest(msg);
      case "task.action":
        return this.taskAction(msg);
      case "hint.request":
        return this.hintRequest(msg);
    }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  private async hello(msg: Extract<GameMessage, { type: "hello" }>): Promise<void> {
    // A new hello is a new game session (first load or a reload of the iframe): new nonce, fresh request log.
    const gen = ++this.gen;
    this.nonce = this.o.randomId();
    this.requests = new Map();
    this.kinds = msg.kinds.filter((k) => INTERACTION_KINDS.includes(k));
    let openTask: PresentBody | null = null;
    try {
      const open = await this.call(() => this.o.service.openTask());
      if (open !== null && this.kinds.includes(open.kind)) openTask = this.present(this.register(open));
    } catch (err) {
      this.o.onServiceError?.(err);
    }
    if (gen !== this.gen) return;
    this.send({ protocol: PROTOCOL, type: "init", msgId: this.o.randomId(), replyTo: msg.msgId, nonce: this.nonce, openTask });
  }

  private async taskRequest(msg: Extract<GameMessage, { type: "task.request" }>): Promise<void> {
    const gen = this.gen;
    this.ack(msg.requestId, "received");
    let task: ServiceTask;
    try {
      task = await this.withRetry(gen, msg.requestId, () =>
        this.o.service.fetchTask({ objectiveId: msg.objectiveId, purpose: msg.purpose, surface: msg.surface, kinds: this.kinds, contextKey: msg.contextKey }),
      );
    } catch (err) {
      this.o.onServiceError?.(err);
      return this.finishError(gen, msg.requestId, errorCodeFor(err, "task_unavailable"));
    }
    if (!this.kinds.includes(task.kind)) return this.finishError(gen, msg.requestId, "kind_not_supported");
    const entry = this.register(task);
    this.finish(gen, msg.requestId, { protocol: PROTOCOL, type: "task.present", nonce: this.nonce as string, requestId: msg.requestId, ...this.present(entry) });
  }

  private async taskAction(msg: Extract<GameMessage, { type: "task.action" }>): Promise<void> {
    const gen = this.gen;
    const entry = this.tokens.get(msg.instanceToken);
    if (entry === undefined) return this.finishError(gen, msg.requestId, "unknown_task");
    if (msg.action.kind !== entry.task.kind) return this.finishError(gen, msg.requestId, "kind_mismatch");
    if (entry.result !== null) {
      // Already closed: the stored verdict again. No second submission, so no second reward.
      return this.finish(gen, msg.requestId, { ...entry.result, nonce: this.nonce as string, requestId: msg.requestId });
    }
    entry.waiting.push(msg.requestId);
    if (entry.submitting) return this.ack(msg.requestId, "submitting");
    entry.submitting = true;
    this.ack(msg.requestId, "submitting");

    // The committed answer is final: a stored pending submission (earlier abort or host reload) is resent
    // with its own submission id and payload, so the server sees one submission however often it arrives.
    const pending = this.readPending(entry.task.instanceId) ?? this.writePending(entry.task.instanceId, {
      submissionId: this.o.randomId(),
      roundNo: entry.task.roundNo,
      action: msg.action,
    });

    let body: Omit<TaskResultMsg, "requestId" | "nonce">;
    try {
      const submitOnce = () =>
        this.o.service.submit({ instanceId: entry.task.instanceId, roundNo: pending.roundNo, submissionId: pending.submissionId, action: pending.action });
      // Automatic resubmission only where the backend itself guarantees it cannot record or pay twice.
      const r = await (this.o.service.submitRetry === "server-idempotent" ? this.withRetry(gen, msg.requestId, submitOnce) : this.call(submitOnce));
      body = {
        protocol: PROTOCOL,
        type: "task.result",
        instanceToken: entry.token,
        outcome: r.outcome,
        feedback: { text: r.feedbackText, correctAnswer: r.correctAnswer },
        evidence: r.evidence,
        retryable: false,
      };
      entry.result = body;
      this.o.store?.removeItem(PENDING_PREFIX + entry.task.instanceId);
    } catch (err) {
      this.o.onServiceError?.(err);
      entry.submitting = false;
      const waiting = entry.waiting.splice(0);
      const ambiguous = (err instanceof ServiceError && err.transient) || err instanceof CallTimeout;
      if (ambiguous && this.o.service.submitRetry !== "server-idempotent") {
        // The request may or may not have been recorded, and this backend cannot tell us safely:
        // stop in an explicit unresolved state. No automatic resend, and the pending entry is kept so
        // nothing new can be committed for this instance from this host.
        const unresolved: Omit<TaskResultMsg, "requestId" | "nonce"> = {
          protocol: PROTOCOL,
          type: "task.result",
          instanceToken: entry.token,
          outcome: "aborted",
          feedback: { text: null, correctAnswer: null },
          evidence: "none",
          retryable: false,
        };
        entry.result = unresolved;
        for (const id of waiting) this.finish(gen, id, { ...unresolved, nonce: this.nonce as string, requestId: id });
        return;
      }
      if (ambiguous) {
        // Nothing is lost: the pending submission stays stored and is resent on the next commit.
        const aborted: Omit<TaskResultMsg, "requestId" | "nonce"> = {
          protocol: PROTOCOL,
          type: "task.result",
          instanceToken: entry.token,
          outcome: "aborted",
          feedback: { text: null, correctAnswer: null },
          evidence: "none",
          retryable: true,
        };
        for (const id of waiting) this.finish(gen, id, { ...aborted, nonce: this.nonce as string, requestId: id });
        return;
      }
      this.o.store?.removeItem(PENDING_PREFIX + entry.task.instanceId);
      for (const id of waiting) this.finishError(gen, id, errorCodeFor(err, "server_error"));
      return;
    }
    entry.submitting = false;
    for (const id of entry.waiting.splice(0)) this.finish(gen, id, { ...body, nonce: this.nonce as string, requestId: id });
  }

  private async hintRequest(msg: Extract<GameMessage, { type: "hint.request" }>): Promise<void> {
    const gen = this.gen;
    const entry = this.tokens.get(msg.instanceToken);
    if (entry === undefined) return this.finishError(gen, msg.requestId, "unknown_task");
    if (entry.result !== null || entry.submitting || msg.level > entry.task.hintsAvailable) {
      return this.finishError(gen, msg.requestId, "hint_unavailable");
    }
    this.ack(msg.requestId, "received");
    try {
      // The server logs the hint; that log, not the game, decides whether the answer counts as assisted.
      const h = await this.withRetry(gen, msg.requestId, () => this.o.service.hint(entry.task.instanceId, msg.level));
      this.finish(gen, msg.requestId, {
        protocol: PROTOCOL,
        type: "hint.show",
        nonce: this.nonce as string,
        requestId: msg.requestId,
        instanceToken: entry.token,
        level: h.level,
        text: h.text,
        hintsRemaining: h.hintsRemaining,
      });
    } catch (err) {
      this.o.onServiceError?.(err);
      this.finishError(gen, msg.requestId, errorCodeFor(err, "hint_unavailable"));
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private register(task: ServiceTask): Entry {
    const existing = this.byInstance.get(task.instanceId);
    if (existing !== undefined) {
      const e = this.tokens.get(existing) as Entry;
      return e;
    }
    const token = this.o.randomId();
    const entry: Entry = { token, task, result: null, waiting: [], submitting: false };
    this.tokens.set(token, entry);
    this.byInstance.set(task.instanceId, token);
    return entry;
  }

  private present(entry: Entry): PresentBody {
    const t = entry.task;
    return {
      instanceToken: entry.token,
      kind: t.kind,
      stimulus: { prompt: t.prompt, options: t.options === null ? null : t.options.map((o) => ({ id: o.id, label: o.label })) },
      mode: t.mode,
      hintsAvailable: t.hintsAvailable,
      contextKey: t.contextKey,
    };
  }

  private readPending(instanceId: string): Pending | null {
    const raw = this.o.store?.getItem(PENDING_PREFIX + instanceId) ?? null;
    if (raw === null) return null;
    try {
      const p = JSON.parse(raw) as Pending;
      if (typeof p.submissionId === "string" && typeof p.roundNo === "number" && typeof p.action === "object" && p.action !== null) return p;
    } catch {
      /* corrupt entry: dropped below */
    }
    this.o.store?.removeItem(PENDING_PREFIX + instanceId);
    return null;
  }

  private writePending(instanceId: string, p: Pending): Pending {
    this.o.store?.setItem(PENDING_PREFIX + instanceId, JSON.stringify(p));
    return p;
  }

  private async withRetry<T>(gen: number, requestId: string, f: () => Promise<T>): Promise<T> {
    const delays = this.o.retryDelaysMs;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.call(f);
      } catch (err) {
        const transient = err instanceof CallTimeout || (err instanceof ServiceError && err.transient);
        if (!transient || attempt >= delays.length) throw err;
        if (gen === this.gen) this.ack(requestId, "retrying");
        await this.sleep(delays[attempt] as number);
      }
    }
  }

  private call<T>(f: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const h = this.timers.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new CallTimeout("backend call timed out"));
      }, this.o.callTimeoutMs);
      let p: Promise<T>;
      try {
        p = f();
      } catch (err) {
        p = Promise.reject(err);
      }
      p.then(
        (v) => {
          if (settled) return;
          settled = true;
          this.timers.clearTimeout(h);
          resolve(v);
        },
        (err: unknown) => {
          if (settled) return;
          settled = true;
          this.timers.clearTimeout(h);
          reject(err);
        },
      );
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.timers.setTimeout(resolve, ms);
    });
  }

  private remember(requestId: string): void {
    if (this.requests.size >= MAX_REMEMBERED_REQUESTS) {
      const oldest = this.requests.keys().next().value as string;
      this.requests.delete(oldest);
    }
    this.requests.set(requestId, { done: null });
  }

  private ack(requestId: string, state: "received" | "submitting" | "retrying"): void {
    if (this.nonce === null) return;
    this.send({ protocol: PROTOCOL, type: "ack", nonce: this.nonce, requestId, state });
  }

  private finish(gen: number, requestId: string, message: HostMessage): void {
    // A reply for a session the game has since replaced is dropped; the game resumes through init.openTask.
    if (gen !== this.gen) return;
    let out: HostMessage = message;
    if (!parseHostMessage(out).ok) {
      // Backend data the protocol cannot carry (e.g. a prompt over the size limit): the game gets an
      // explicit error instead of a request that never ends. Reported, never silent.
      this.o.onServiceError?.(new Error(`bridge host: backend data does not fit the protocol (${message.type})`));
      out = { protocol: PROTOCOL, type: "error", nonce: this.nonce, requestId, code: "server_error" };
    }
    const state = this.requests.get(requestId);
    if (state !== undefined) state.done = out;
    this.send(out);
  }

  private finishError(gen: number, requestId: string, code: ErrorCode): void {
    this.finish(gen, requestId, { protocol: PROTOCOL, type: "error", nonce: this.nonce, requestId, code });
  }

  private send(message: HostMessage): void {
    // Our own output is validated too: a bug must fail here, loudly, not in the game.
    const check = parseHostMessage(message);
    if (!check.ok) throw new Error(`bridge host produced an invalid message: ${check.reason}`);
    this.o.post(message);
  }

  private reject(reason: RejectReason, detail: string): void {
    this.o.onReject?.(reason, detail);
  }
}

function errorCodeFor(err: unknown, fallback: ErrorCode): ErrorCode {
  if (!(err instanceof ServiceError)) return fallback;
  if (err.code === "forbidden" || err.code === "not_found") return "unknown_task";
  // The pupil must sign in again in Lærlig; the game never sees or renews a session itself.
  if (err.code === "unauthorized") return "session_expired";
  // A manipulated action the backend adapter refused before any server call.
  if (err.code === "invalid") return "invalid_message";
  return fallback;
}
