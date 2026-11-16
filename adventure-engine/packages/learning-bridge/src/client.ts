import {
  HELLO_PROTOCOL,
  PROTOCOL,
  PROTOCOL_V2,
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
  type IntroPresentMsg,
  type IntroRecordedMsg,
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
  /**
   * F11-B: this game can show the server's introduction (IntroView). Offers bridge/3 in the hello and enables
   * `requestStep`, `introShown` and `introDone`. Absent/false: bridge/2 only, as before.
   */
  readonly introductions?: boolean;
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
  readonly expect: readonly HostMessage["type"][];
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
 * Game end of `laerligverse.bridge/3`, which also speaks `/2` (D-306, F11-B). The version is the one the host
 * answers `init` in; in a bridge/2 session the introduction calls refuse locally and no introduction can arrive.
 *
 * Original contract (bridge/2): The game asks for tasks, reports committed actions and
 * waits for verdicts. It has no session, no instance id and no answer key, and no message lets it grant
 * XP, coins, mastery or evidence: those fields do not exist in the protocol.
 */
export class BridgeClient {
  private readonly o: BridgeClientOptions;
  private readonly timers: Timers;
  private nonce: string | null = null;
  /** The version the host chose in its init (null before the handshake). */
  private proto: string | null = null;
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

  /** The negotiated bridge version (null before the handshake). */
  get protocol(): string | null {
    return this.proto;
  }

  /** Handshake. Resolves with the instance still open on the server (resumption), or null. */
  connect(): Promise<PresentBody | null> {
    if (this.connectWaiter !== null) return Promise.reject(new BridgeError("closed"));
    this.nonce = null;
    this.proto = null;
    this.setStatus("connecting");
    return new Promise((resolve, reject) => {
      this.connectWaiter = { resolve, reject, timer: null, attempts: 0 };
      this.sendHello();
    });
  }

  /** Asks for the next task at a decision point (a game that does not show introductions; unchanged since bridge/2). */
  requestTask(q: { objectiveId: string; purpose: Purpose; surface: Surface; contextKey: string }): Promise<TaskPresentMsg> {
    return this.request<TaskPresentMsg>(["task.present"], (nonce, requestId, protocol) => ({ protocol, type: "task.request", nonce, requestId, ...q }));
  }

  /**
   * F11-B, only for a game built with `introductions: true`: the next step at a decision point — a task, or, in a
   * bridge/3 session, the server's introduction (`intro.present`). For an introduction: show the cards, then
   * `introShown`, then — after the pupil's final control — `introDone`, and ask again.
   */
  requestStep(q: { objectiveId: string; purpose: Purpose; surface: Surface; contextKey: string }): Promise<TaskPresentMsg | IntroPresentMsg> {
    if (this.o.introductions !== true) return Promise.reject(new BridgeError("unsupported_protocol"));
    return this.request<TaskPresentMsg | IntroPresentMsg>(["task.present", "intro.present"], (nonce, requestId, protocol) => ({ protocol, type: "task.request", nonce, requestId, ...q }));
  }

  /** bridge/3: the introduction's cards are on the screen now. Resolves when the host has the server's answer. */
  introShown(introToken: string): Promise<IntroRecordedMsg> {
    return this.introReport("intro.shown", introToken);
  }

  /** bridge/3: the pupil finished the introduction. Never evidence; only lets the server's sequence move on. */
  introDone(introToken: string): Promise<IntroRecordedMsg> {
    return this.introReport("intro.done", introToken);
  }

  private introReport(type: "intro.shown" | "intro.done", introToken: string): Promise<IntroRecordedMsg> {
    // Never in a bridge/2 session, and never from a game that did not declare it shows introductions.
    if (this.o.introductions !== true || (this.nonce !== null && this.proto !== PROTOCOL)) return Promise.reject(new BridgeError("unsupported_protocol"));
    return this.request<IntroRecordedMsg>(["intro.recorded"], (nonce, requestId, protocol) => ({ protocol, type, nonce, requestId, introToken }));
  }

  /** Sends a committed action. Resolves with the server's verdict (`aborted` when the host gave up retrying). */
  act(instanceToken: string, action: Action): Promise<TaskResultMsg> {
    const clean = parseAction(action);
    const clientSeq = ++this.seq;
    return this.request<TaskResultMsg>(["task.result"], (nonce, requestId, protocol) => ({
      protocol,
      type: "task.action",
      nonce,
      requestId,
      instanceToken,
      action: clean,
      clientSeq,
    }));
  }

  hint(instanceToken: string, level: number): Promise<HintShowMsg> {
    return this.request<HintShowMsg>(["hint.show"], (nonce, requestId, protocol) => ({ protocol, type: "hint.request", nonce, requestId, instanceToken, level }));
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
      this.proto = m.protocol;
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
    if (m.protocol !== this.proto) return this.reject("invalid", `${m.type}: protocol ${m.protocol} in a ${String(this.proto)} session`);

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
    if (!w.expect.includes(m.type)) return w.reject(new BridgeError("invalid_message"));
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
      // The negotiation travels in the bridge/2 envelope, which every host since bridge/2 reads.
      protocol: HELLO_PROTOCOL,
      type: "hello",
      msgId: this.helloId,
      // Only a game that shows introductions offers bridge/3; any other game stays on bridge/2, where the host never
      // sends an introduction (it answers task_unavailable instead).
      supports: this.o.introductions === true ? [...SUPPORTED_PROTOCOLS] : [PROTOCOL_V2],
      kinds: [...this.o.kinds],
      contentId: this.o.contentId,
      contentVersion: this.o.contentVersion,
    });
    w.timer = this.timers.setTimeout(() => this.sendHello(), this.o.helloIntervalMs ?? 500);
  }

  private request<T extends HostMessage>(
    expect: readonly HostMessage["type"][],
    build: (nonce: string, requestId: string, protocol: string) => GameMessage & { requestId: string },
  ): Promise<T> {
    if (this.nonce === null || this.proto === null) return Promise.reject(new BridgeError("not_ready"));
    const message = build(this.nonce, this.o.randomId(), this.proto);
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
