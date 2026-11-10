import {
  PROTOCOL,
  SUPPORTED_PROTOCOLS,
  parseAction,
  parseHostMessage,
  type Action,
  type ErrorCode,
  type GameMessage,
  type HintShowMsg,
  type HostMessage,
  type InboundEvent,
  type InteractionKind,
  type PresentBody,
  type Purpose,
  type RejectReason,
  type Surface,
  type TaskPresentMsg,
  type TaskResultMsg,
} from "./protocol.ts";
import type { Timers } from "./host.ts";

export type ClientStatus = "connecting" | "ready" | "waiting" | "retrying" | "offline" | "unsupported";

export class BridgeError extends Error {
  readonly code: ErrorCode | "timeout" | "closed";
  constructor(code: BridgeError["code"]) {
    super(`bridge: ${code}`);
    this.name = "BridgeError";
    this.code = code;
  }
}

export interface BridgeClientOptions {
  /** The host page's exact origin (configuration of the game build). */
  readonly hostOrigin: string;
  /** `window.parent`; `event.source` must be this object. */
  readonly hostWindow: unknown;
  /** The browser wiring is `window.parent.postMessage(msg, hostOrigin)` — never "*". */
  readonly post: (message: GameMessage) => void;
  readonly randomId: () => string;
  readonly kinds: readonly InteractionKind[];
  readonly contentId: string;
  readonly contentVersion: string;
  readonly timers?: Timers;
  /** Silence before a request is resent with the same requestId. Default 8000 ms. */
  readonly replyTimeoutMs?: number;
  /** After an ack the host is working (it retries the backend itself): wait this long. Default 60 000 ms. */
  readonly ackedTimeoutMs?: number;
  /** Resends of the same request before giving up. Default 2. */
  readonly maxResends?: number;
  readonly helloIntervalMs?: number;
  readonly helloAttempts?: number;
  readonly onStatus?: (status: ClientStatus) => void;
  readonly onReject?: (reason: RejectReason, detail: string) => void;
}

interface Waiter {
  readonly message: GameMessage & { requestId: string };
  readonly expect: HostMessage["type"];
  readonly resolve: (m: HostMessage) => void;
  readonly reject: (e: BridgeError) => void;
  resends: number;
  timer: unknown;
}

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
};

/**
 * Game end of `laerligverse.bridge/2` (D-306). The game asks for tasks, reports committed actions and
 * waits for verdicts. It has no session, no instance id and no answer key, and no message lets it grant
 * XP, coins, mastery or evidence: those fields do not exist in the protocol.
 */
export class BridgeClient {
  private readonly o: BridgeClientOptions;
  private readonly timers: Timers;
  private nonce: string | null = null;
  private helloId: string | null = null;
  private seq = 0;
  private readonly waiters = new Map<string, Waiter>();
  private connectWaiter: { resolve: (open: PresentBody | null) => void; reject: (e: BridgeError) => void; timer: unknown; attempts: number } | null = null;
  private statusNow: ClientStatus = "connecting";

  constructor(options: BridgeClientOptions) {
    this.o = options;
    this.timers = options.timers ?? defaultTimers;
  }

  get status(): ClientStatus {
    return this.statusNow;
  }

  /** Handshake. Resolves with the instance still open on the server (resumption), or null. */
  connect(): Promise<PresentBody | null> {
    if (this.connectWaiter !== null) return Promise.reject(new BridgeError("closed"));
    this.nonce = null;
    this.setStatus("connecting");
    return new Promise((resolve, reject) => {
      this.connectWaiter = { resolve, reject, timer: null, attempts: 0 };
      this.sendHello();
    });
  }

  requestTask(q: { objectiveId: string; purpose: Purpose; surface: Surface; contextKey: string }): Promise<TaskPresentMsg> {
    return this.request<TaskPresentMsg>("task.present", (nonce, requestId) => ({ protocol: PROTOCOL, type: "task.request", nonce, requestId, ...q }));
  }

  /** Sends a committed action. Resolves with the server's verdict (`aborted` when the host gave up retrying). */
  act(instanceToken: string, action: Action): Promise<TaskResultMsg> {
    const clean = parseAction(action);
    const clientSeq = ++this.seq;
    return this.request<TaskResultMsg>("task.result", (nonce, requestId) => ({
      protocol: PROTOCOL,
      type: "task.action",
      nonce,
      requestId,
      instanceToken,
      action: clean,
      clientSeq,
    }));
  }

  hint(instanceToken: string, level: number): Promise<HintShowMsg> {
    return this.request<HintShowMsg>("hint.show", (nonce, requestId) => ({ protocol: PROTOCOL, type: "hint.request", nonce, requestId, instanceToken, level }));
  }

  /** Feed every `message` event of the game window here. */
  onMessage(event: InboundEvent): void {
    if (event.origin !== this.o.hostOrigin) return this.reject("origin", event.origin);
    if (event.source !== this.o.hostWindow) return this.reject("source", "unexpected window");
    const parsed = parseHostMessage(event.data);
    if (!parsed.ok) return this.reject("invalid", parsed.reason);
    const m = parsed.value;

    if (m.type === "init") {
      const w = this.connectWaiter;
      if (w === null || m.replyTo !== this.helloId) return this.reject("state", "unexpected init");
      this.timers.clearTimeout(w.timer);
      this.connectWaiter = null;
      this.nonce = m.nonce;
      this.setStatus("ready");
      w.resolve(m.openTask);
      return;
    }
    if (m.type === "error" && m.requestId === null) {
      if (m.code === "unsupported_protocol" && this.connectWaiter !== null) {
        const w = this.connectWaiter;
        this.timers.clearTimeout(w.timer);
        this.connectWaiter = null;
        this.setStatus("unsupported");
        w.reject(new BridgeError("unsupported_protocol"));
        return;
      }
      return this.reject("state", `error ${m.code}`);
    }
    if (this.nonce === null || m.nonce !== this.nonce) return this.reject("nonce", m.type);

    const w = this.waiters.get(m.requestId as string);
    if (w === undefined) return this.reject("state", `no request waits for ${m.type}`); // late duplicate: ignored
    if (m.type === "ack") {
      this.setStatus(m.state === "retrying" ? "retrying" : "waiting");
      this.arm(w, this.o.ackedTimeoutMs ?? 60_000);
      return;
    }
    this.timers.clearTimeout(w.timer);
    this.waiters.delete(w.message.requestId);
    if (this.waiters.size === 0) this.setStatus("ready");
    if (m.type === "error") return w.reject(new BridgeError(m.code));
    if (m.type !== w.expect) return w.reject(new BridgeError("invalid_message"));
    w.resolve(m);
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  private sendHello(): void {
    const w = this.connectWaiter;
    if (w === null) return;
    if (w.attempts >= (this.o.helloAttempts ?? 20)) {
      this.connectWaiter = null;
      this.setStatus("offline");
      w.reject(new BridgeError("timeout"));
      return;
    }
    w.attempts++;
    // Every hello has a fresh id; only an init answering the latest one is accepted.
    this.helloId = this.o.randomId();
    this.o.post({
      protocol: PROTOCOL,
      type: "hello",
      msgId: this.helloId,
      supports: [...SUPPORTED_PROTOCOLS],
      kinds: [...this.o.kinds],
      contentId: this.o.contentId,
      contentVersion: this.o.contentVersion,
    });
    w.timer = this.timers.setTimeout(() => this.sendHello(), this.o.helloIntervalMs ?? 500);
  }

  private request<T extends HostMessage>(expect: HostMessage["type"], build: (nonce: string, requestId: string) => GameMessage & { requestId: string }): Promise<T> {
    if (this.nonce === null) return Promise.reject(new BridgeError("not_ready"));
    const message = build(this.nonce, this.o.randomId());
    return new Promise<T>((resolve, reject) => {
      const w: Waiter = { message, expect, resolve: resolve as (m: HostMessage) => void, reject, resends: 0, timer: null };
      this.waiters.set(message.requestId, w);
      this.setStatus("waiting");
      this.o.post(message);
      this.arm(w, this.o.replyTimeoutMs ?? 8000);
    });
  }

  private arm(w: Waiter, ms: number): void {
    this.timers.clearTimeout(w.timer);
    w.timer = this.timers.setTimeout(() => this.onSilence(w), ms);
  }

  private onSilence(w: Waiter): void {
    if (this.waiters.get(w.message.requestId) !== w) return;
    if (w.resends < (this.o.maxResends ?? 2)) {
      // Same requestId: the host answers a duplicate with its stored reply and never acts twice.
      w.resends++;
      this.setStatus("retrying");
      this.o.post(w.message);
      this.arm(w, this.o.replyTimeoutMs ?? 8000);
      return;
    }
    this.waiters.delete(w.message.requestId);
    this.setStatus("offline");
    w.reject(new BridgeError("timeout"));
  }

  private setStatus(s: ClientStatus): void {
    if (s === this.statusNow) return;
    this.statusNow = s;
    this.o.onStatus?.(s);
  }

  private reject(reason: RejectReason, detail: string): void {
    this.o.onReject?.(reason, detail);
  }
}
