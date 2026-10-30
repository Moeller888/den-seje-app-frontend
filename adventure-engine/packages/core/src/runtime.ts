/**
 * Graph runtime (spec 02 B3–B7, 01 A6–A7).
 *
 * Execution model:
 * - A *run* executes a graph from an entry node with its own context.
 * - Each node execution is an *activation*. When its own effect is done, an
 *   activation starts ALL successors (sorted: `set` first, then edge order) and
 *   completes with the AND of their results. No successors → `true`.
 * - Successors are started one at a time; each runs until it completes or waits
 *   before the next starts (depth-first to the first wait point). This is
 *   implemented with the scheduler's LIFO work stack, never with recursion.
 * - Every activation completes exactly once with `true`, `false` or `cancelled`.
 */

import type {
  AnimationDef,
  ContainerRef,
  Edge,
  EntryNode,
  GraphDef,
  IndexedNode,
  LoadedContent,
  NodeDef,
  UseKind,
  Value,
  VariantDef,
} from "@adventure-engine/content";
import {
  COMMAND_TIMEOUT_MS,
  FIRE_AND_FORGET,
  PLAYER_COMMANDS,
  type ChoiceOption,
  type Command,
  type CommandReply,
  type PresentationAdapter,
} from "./commands.ts";
import { EngineError, EngineErrorCode, RuntimeCode, type RuntimeCodeValue } from "./errors.ts";
import { evaluateBool } from "./expression.ts";
import type { ModalLocks } from "./modal.ts";
import type { AmbientTracker } from "./ambient.ts";
import type { Navigator } from "./navigator.ts";
import { ownerScene } from "./ownership.ts";
import type { Rng } from "./rng.ts";
import type { Scheduler } from "./scheduler.ts";
import { ContextFrame, lookup, type Globals } from "./scope.ts";
import { roundTime, type Tracer } from "./trace.ts";
import type { ActorState, WorldState } from "./world.ts";

export type RunResult = true | false | "cancelled";

export interface RunInfo {
  readonly id: string;
  readonly entry: string | null;
  readonly receiver: string | null;
  readonly action: string | null;
  readonly status: "running" | "done";
  readonly result: RunResult | null;
  /**
   * True once the run or one of its child runs issued a command, changed the
   * world, wrote a global or started a walk (spec 04 D5 "something happened").
   */
  readonly activity: boolean;
}

/** Mutable engine state shared with the runtime (world/globals are replaced on new game). */
export interface RuntimeHost {
  readonly content: LoadedContent;
  readonly sched: Scheduler;
  readonly modal: ModalLocks;
  readonly tracer: Tracer;
  readonly adapter: PresentationAdapter;
  readonly rng: Rng;
  readonly world: WorldState;
  readonly globals: Globals;
  readonly devMode: boolean;
  readonly watchdogMs: number;
  warn(code: RuntimeCodeValue, message: string, runId: string | null, nodeId: string | null): void;
  /** Called after a global write (for write-order assertions and "something happened" detection). */
  onGlobalWrite(name: string, value: Value): void;
  /** Called once per run when it ends (including cancellation). */
  onRunEnd(run: RunInfo, result: RunResult): void;
  /** Called when an event is delivered to a receiver. */
  onEvent(runId: string, action: string, receiver: string, ctx: Readonly<Record<string, Value>>): void;
  onQuit(): void;
  /** Movement, trigger zones and scroll (phase 2). */
  readonly nav: Navigator;
  /** Running loop sounds for saves (phase 5). */
  readonly ambient: AmbientTracker;
}

/** Observable state of a running scene transition (spec 03 C7). */
export interface TransitionState {
  readonly runId: string;
  readonly actor: string;
  readonly from: string | null;
  readonly to: string;
  phase: "exit" | "enter";
}

interface JoinState {
  readonly nodeId: string;
  readonly arrivals: Act[];
}

/** Devtools view of one active run. */
export interface ActiveRunView {
  readonly runId: string;
  readonly entry: string | null;
  readonly receiver: string | null;
  readonly action: string | null;
  /** Every active activation is a background branch (does not block saving). */
  readonly background: boolean;
  /** Node ids of the active activations, sorted. */
  readonly nodes: readonly string[];
}

interface Run {
  readonly id: string;
  readonly entry: string | null;
  readonly receiver: string | null;
  readonly action: string | null;
  status: "running" | "done";
  result: RunResult | null;
  activity: boolean;
  readonly parent: Run | null;
  readonly children: Set<Run>;
  readonly acts: Set<Act>;
  /** Activations that may still produce new successors (queued or in their own effect). */
  readonly frontier: Set<Act>;
  readonly joins: Map<string, JoinState>;
  readonly inputLocks: number[];
  readonly timers: Set<number>;
  readonly cmds: Set<string>;
  cancelled: boolean;
  readonly onEnd: (r: RunResult, run: RunInfo) => void;
}

interface Act {
  readonly id: number;
  readonly run: Run;
  readonly ixn: IndexedNode;
  readonly ctx: ContextFrame;
  readonly parent: Act | null;
  readonly sink: ((r: RunResult) => void) | null;
  status: "queued" | "effect" | "children" | "done";
  pending: number;
  acc: boolean;
  lock: number | null;
  /** Modal lock held during a scene transition (spec 03 C7). */
  transitionLock: number | null;
  readonly dialogOwner: string | null;
  readonly chosenOption: boolean;
  followers: Act[];
  /** Part of a background branch (detach / delay background): does not block saving (spec 05 E3). */
  background: boolean;
}

interface PendingCommand {
  readonly cmd: Command;
  readonly run: Run | null;
  readonly issuedAt: number;
  readonly onReply: (reply: CommandReply) => void;
  readonly timers: number[];
}

export interface StartRunOptions {
  readonly entryNodeId: string | null;
  readonly entryRef: string | null;
  readonly ctx: ContextFrame;
  readonly receiver: string | null;
  readonly action: string | null;
  readonly parent: Run | null;
  readonly dialogOwner: string | null;
  readonly onEnd: (r: RunResult, run: RunInfo) => void;
  /** Result when there is no entry node to execute: true = "no logic, nothing to object to", false = unresolvable receiver. */
  readonly emptyResult: boolean;
}

const SYNTH_GRAPH: GraphDef = { id: "$ui", kind: "logic", nodes: [] };

export class Runtime {
  private nextRun = 1;
  private nextAct = 1;
  private nextCmd = 1;
  private readonly runs = new Set<Run>();
  private readonly pending = new Map<string, PendingCommand>();
  private readonly stale = new Set<string>();
  private readonly synthetic = new Map<string, IndexedNode>();
  /** Node execution counter (node id → number of executions). */
  readonly executions = new Map<string, number>();
  private readonly transitions = new Map<Act, TransitionState>();
  /** Player scene transitions that have finished (autosave trigger, spec 05 E3.2). */
  completedTransitions = 0;
  /** Run whose node is executing right now (attributes world changes and global writes). */
  private current: Run | null = null;

  private readonly h: RuntimeHost;

  constructor(h: RuntimeHost) {
    this.h = h;
    h.sched.onIdle(() => this.checkJoins());
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Register runtime-only nodes (used by the interaction layer); ids must start with "$". */
  addSyntheticNodes(nodes: readonly NodeDef[]): void {
    for (const node of nodes) {
      if (!node.id.startsWith("$")) throw new EngineError(EngineErrorCode.BadArgument, `synthetic node ids must start with "$": ${node.id}`);
      this.synthetic.set(node.id, { node, graph: SYNTH_GRAPH, path: node.id, edges: edgesOf(node) });
    }
  }

  startRun(o: StartRunOptions): RunInfo {
    const run: Run = {
      id: `r${this.nextRun++}`,
      entry: o.entryRef,
      receiver: o.receiver,
      action: o.action,
      status: "running",
      result: null,
      activity: false,
      parent: o.parent,
      children: new Set(),
      acts: new Set(),
      frontier: new Set(),
      joins: new Map(),
      inputLocks: [],
      timers: new Set(),
      cmds: new Set(),
      cancelled: false,
      onEnd: o.onEnd,
    };
    this.runs.add(run);
    o.parent?.children.add(run);
    this.h.tracer.emit("run.start", { runId: run.id, entry: o.entryRef, receiver: o.receiver, action: o.action, ctx: o.ctx.flatten() });
    const ixn = o.entryNodeId === null ? undefined : this.node(o.entryNodeId);
    if (ixn === undefined) {
      const result = o.emptyResult;
      this.h.sched.push(() => this.endRun(run, result));
    } else {
      const root = this.createAct(run, ixn, o.ctx, null, (r) => this.endRun(run, r), o.dialogOwner, false);
      this.h.sched.push(() => this.execute(root));
    }
    return run;
  }

  /** Answer a pending command. Returns false if the command belonged to a cancelled run (ignored). */
  reply(cmdId: string, reply: CommandReply): boolean {
    const p = this.pending.get(cmdId);
    if (p === undefined) {
      if (this.stale.has(cmdId)) {
        this.h.tracer.emit("reply.ignored", { cmdId, reply: reply.kind });
        return false;
      }
      throw new EngineError(EngineErrorCode.BadReply, `no pending command "${cmdId}"`);
    }
    const t = p.cmd.type;
    const ok =
      t === "Choose"
        ? reply.kind === "choice" && p.cmd.options.some((opt) => opt.id === reply.optionId)
        : t === "Say"
          ? reply.kind === "done"
          : reply.kind === "done" || reply.kind === "failed";
    if (!ok) throw new EngineError(EngineErrorCode.BadReply, `invalid reply ${JSON.stringify(reply)} for ${t} ${cmdId}`);
    this.pending.delete(cmdId);
    p.run?.cmds.delete(cmdId);
    for (const id of p.timers) {
      this.h.sched.clearTimer(id);
      p.run?.timers.delete(id);
    }
    this.h.tracer.emit("reply", { cmdId, reply: reply.kind === "choice" ? reply.optionId : reply.kind });
    p.onReply(reply);
    this.h.sched.drain();
    return true;
  }

  /** A world change or global write happened; attribute it to the executing run, if any. */
  noteActivity(): void {
    if (this.current !== null) this.markActivity(this.current);
  }

  private markActivity(run: Run): void {
    for (let r: Run | null = run; r !== null && !r.activity; r = r.parent) r.activity = true;
  }

  /** Issue an engine-level command (not tied to a run). */
  issueEngineCommand(build: (base: { cmdId: string; runId: string; nodeId: string | null }) => Command, onReply: ((r: CommandReply) => void) | null): string {
    return this.issue(null, null, build, onReply);
  }

  pendingCommands(): Command[] {
    return [...this.pending.values()].map((p) => p.cmd);
  }

  /** Cancel every active run (load / new game / back to title, spec 02 B6.2). */
  cancelAll(reason: string): void {
    this.h.tracer.emit("runs.cancelAll", { reason });
    // Child runs always belong to a live parent run, so cancelling the roots cancels everything.
    for (const run of [...this.runs]) if (run.parent === null) this.cancelRun(run);
    this.h.nav.cancelAll();
    for (const [cmdId, p] of [...this.pending]) {
      if (p.run === null) {
        this.pending.delete(cmdId);
        for (const id of p.timers) this.h.sched.clearTimer(id);
        this.stale.add(cmdId);
      }
    }
    this.h.sched.drain();
  }

  /** Runs with work that is not a background branch (they block saving, spec 05 E3). */
  foregroundRunCount(): number {
    let n = 0;
    for (const run of this.runs) if ([...run.acts].some((a) => !a.background)) n++;
    return n;
  }

  activeRunCount(): number {
    return this.runs.size;
  }

  /** Read-only view of the active runs (devtools): what runs, and which nodes are active. */
  activeRuns(): ActiveRunView[] {
    return [...this.runs].map((run) => ({
      runId: run.id,
      entry: run.entry,
      receiver: run.receiver,
      action: run.action,
      background: run.acts.size > 0 && [...run.acts].every((a) => a.background),
      nodes: [...run.acts].map((a) => a.ixn.node.id).sort(),
    }));
  }

  // ---------------------------------------------------------------------------
  // Activation lifecycle
  // ---------------------------------------------------------------------------

  private node(id: string): IndexedNode | undefined {
    return this.h.content.nodes.get(id) ?? this.synthetic.get(id);
  }

  private createAct(
    run: Run,
    ixn: IndexedNode,
    ctx: ContextFrame,
    parent: Act | null,
    sink: ((r: RunResult) => void) | null,
    dialogOwner: string | null,
    chosenOption: boolean,
  ): Act {
    const act: Act = {
      id: this.nextAct++,
      run,
      ixn,
      ctx,
      parent,
      sink,
      status: "queued",
      pending: 0,
      acc: true,
      lock: null,
      transitionLock: null,
      dialogOwner,
      chosenOption,
      followers: [],
      background: parent?.background ?? false,
    };
    run.acts.add(act);
    run.frontier.add(act);
    return act;
  }

  private warn(act: Act, code: RuntimeCodeValue, message: string): void {
    this.h.warn(code, message, act.run.id, act.ixn.node.id);
  }

  /** Sorted successor edges (spec 02 B3.2): set first, then edge order, then file position. */
  private sortedEdges(edges: readonly Edge[]): Edge[] {
    const prio = (e: Edge): number => (this.node(e.to)?.node.type === "set" ? 1 : 0);
    return [...edges].sort((a, b) => prio(b) - prio(a) || a.order - b.order || a.position - b.position);
  }

  /** Start successors as children of `act` (the node's own effect is finished). */
  private proceed(act: Act, ctx: ContextFrame = act.ctx, edges: readonly Edge[] = act.ixn.edges): void {
    const items: IndexedNode[] = [];
    for (const e of this.sortedEdges(edges)) {
      const target = this.node(e.to);
      if (target === undefined) {
        this.warn(act, RuntimeCode.Ref, `edge to unknown node "${e.to}"`);
        act.acc = false;
      } else items.push(target);
    }
    this.spawn(act, items.map((ixn) => ({ ixn, chosen: false })), ctx);
  }

  private spawn(act: Act, items: ReadonlyArray<{ ixn: IndexedNode; chosen: boolean }>, ctx: ContextFrame): void {
    act.run.frontier.delete(act);
    act.status = "children";
    act.pending = items.length;
    if (items.length === 0) {
      this.h.sched.push(() => this.complete(act, act.acc));
      return;
    }
    const children = items.map((it) => this.createAct(act.run, it.ixn, ctx, act, null, act.dialogOwner, it.chosen));
    this.h.sched.pushInOrder(children.map((c) => () => this.execute(c)));
  }

  /** Complete without starting successors ("stop"). */
  private finish(act: Act, r: RunResult): void {
    act.run.frontier.delete(act);
    act.status = "children";
    this.h.sched.push(() => this.complete(act, r));
  }

  private complete(act: Act, r: RunResult): void {
    if (act.status === "done") return;
    act.status = "done";
    const run = act.run;
    run.acts.delete(act);
    run.frontier.delete(act);
    if (act.lock !== null) {
      this.h.modal.release(act.lock);
      act.lock = null;
    }
    this.releaseTransition(act);
    this.h.tracer.emit("node.end", { runId: run.id, nodeId: act.ixn.node.id, result: r });
    for (const f of act.followers) this.h.sched.push(() => this.complete(f, r));
    const p = act.parent;
    if (p !== null) {
      p.pending--;
      if (r !== true) p.acc = false;
      if (p.pending === 0) this.h.sched.push(() => this.complete(p, p.acc));
    }
    if (act.sink !== null) act.sink(r);
    if (run.status === "done" && run.acts.size === 0) this.finalizeRun(run);
  }

  private endRun(run: Run, r: RunResult): void {
    run.status = "done";
    run.result = r;
    this.h.tracer.emit("run.end", { runId: run.id, result: r });
    if (run.acts.size === 0) this.finalizeRun(run);
    this.h.onRunEnd(run, r);
    run.onEnd(r, run);
  }

  private finalizeRun(run: Run): void {
    if (!this.runs.has(run)) return;
    while (run.inputLocks.length > 0) {
      this.h.modal.release(run.inputLocks.pop() as number);
      this.h.warn(RuntimeCode.LockLeak, "input_lock was not released before the run ended; released automatically", run.id, null);
    }
    this.runs.delete(run);
    run.parent?.children.delete(run);
  }

  private cancelRun(root: Run): void {
    const stack: Run[] = [root];
    while (stack.length > 0) {
      const run = stack.pop() as Run;
      run.cancelled = true;
      for (const child of run.children) stack.push(child);
      for (const act of run.acts) {
        act.status = "done";
        if (act.lock !== null) this.h.modal.release(act.lock);
        act.lock = null;
        this.releaseTransition(act);
      }
      run.acts.clear();
      run.frontier.clear();
      run.joins.clear();
      for (const id of run.timers) this.h.sched.clearTimer(id);
      run.timers.clear();
      for (const cmdId of run.cmds) {
        const p = this.pending.get(cmdId) as PendingCommand;
        for (const id of p.timers) this.h.sched.clearTimer(id);
        this.pending.delete(cmdId);
        this.stale.add(cmdId);
        this.h.adapter.onCommandAbandoned?.(p.cmd, "cancelled");
      }
      run.cmds.clear();
      this.h.adapter.onRunCancelled?.(run.id);
      this.h.nav.cancelRun(run.id);
      while (run.inputLocks.length > 0) this.h.modal.release(run.inputLocks.pop() as number);
      this.h.tracer.emit("run.cancel", { runId: run.id });
      this.runs.delete(run);
      run.parent?.children.delete(run);
      if (run.status === "running") {
        run.status = "done";
        run.result = "cancelled";
        this.h.tracer.emit("run.end", { runId: run.id, result: "cancelled" });
        this.h.onRunEnd(run, "cancelled");
        run.onEnd("cancelled", run);
      }
    }
  }

  private timer(act: Act, ms: number, fn: () => void): void {
    const run = act.run;
    const id = this.h.sched.setTimer(ms, () => {
      run.timers.delete(id);
      fn();
    });
    run.timers.add(id);
  }

  private issue(
    act: Act | null,
    run: Run | null,
    build: (base: { cmdId: string; runId: string; nodeId: string | null }) => Command,
    /** null = fire-and-forget: core does not wait for a reply. */
    onReply: ((reply: CommandReply) => void) | null,
  ): string {
    const cmdId = `c${this.nextCmd++}`;
    const cmd = build({ cmdId, runId: run?.id ?? "engine", nodeId: act?.ixn.node.id ?? null });
    if (run !== null) this.markActivity(run);
    this.h.tracer.emit("cmd", { runId: cmd.runId, nodeId: cmd.nodeId, cmdId, cmd });
    const disposition = this.h.adapter.onCommand(cmd);
    if (onReply === null || FIRE_AND_FORGET.has(cmd.type)) return cmdId;
    const timers: number[] = [];
    const addTimer = (ms: number, fn: () => void): void => {
      const id = this.h.sched.setTimer(ms, fn);
      timers.push(id);
      run?.timers.add(id);
    };
    this.pending.set(cmdId, { cmd, run, issuedAt: this.h.sched.now, onReply, timers });
    run?.cmds.add(cmdId);
    if (!PLAYER_COMMANDS.has(cmd.type)) {
      if (disposition.kind === "auto") {
        addTimer(disposition.afterMs, () => this.reply(cmdId, { kind: "done" }));
      } else {
        const timeout = cmd.type === "PlayAnimation" && cmd.timeoutMs !== undefined ? cmd.timeoutMs : (COMMAND_TIMEOUT_MS[cmd.type] as number);
        addTimer(timeout, () => {
          this.h.warn(RuntimeCode.CommandTimeout, `${cmd.type} ${cmdId} timed out after ${timeout} ms; auto-completing`, cmd.runId, cmd.nodeId);
          this.h.adapter.onCommandAbandoned?.(cmd, "timeout");
          this.reply(cmdId, { kind: "done" });
        });
      }
    }
    if (this.h.devMode) {
      addTimer(this.h.watchdogMs, () => {
        if (this.pending.has(cmdId)) {
          this.h.warn(RuntimeCode.Watchdog, `${cmd.type} ${cmdId} has waited ${this.h.watchdogMs} ms`, cmd.runId, cmd.nodeId);
        }
      });
    }
    return cmdId;
  }

  /**
   * Issue a command from an activation and continue with `then` when answered.
   * Cancellation marks the command stale, so `then` never runs for a cancelled activation.
   */
  private await(act: Act, build: (base: { cmdId: string; runId: string; nodeId: string | null }) => Command, then: (reply: CommandReply) => void): void {
    this.issue(act, act.run, build, then);
  }

  // ---------------------------------------------------------------------------
  // Events: a new run from a receiver's entry (spec 01 A4)
  // ---------------------------------------------------------------------------

  /** Entry ref of a receiver ("$game", scene, actor, object or portal id). Undefined = unknown receiver. */
  entryOf(receiver: string): { entryRef: string | null } | undefined {
    const c = this.h.content;
    if (receiver === "$game") return { entryRef: c.pkg.game.entry ?? null };
    const e = c.scenes.get(receiver) ?? c.actors.get(receiver) ?? c.objects.get(receiver) ?? c.portals.get(receiver);
    return e === undefined ? undefined : { entryRef: e.entry };
  }

  emitEvent(
    receiver: string,
    action: string,
    ctxValues: Readonly<Record<string, Value | null>>,
    parent: Run | null,
    onEnd: (r: RunResult, run: RunInfo) => void,
    dialogOwner: string | null = null,
  ): RunInfo {
    const ctx = ContextFrame.root({ $action: action, ...ctxValues });
    const found = this.entryOf(receiver);
    let entryRef: string | null = found?.entryRef ?? null;
    let entryNodeId: string | null = null;
    if (found === undefined) {
      this.h.warn(RuntimeCode.Ref, `unknown event receiver "${receiver}"`, parent?.id ?? null, null);
    } else if (entryRef !== null) {
      entryNodeId = this.h.content.entries.get(entryRef) ?? null;
      if (entryNodeId === null) {
        this.h.warn(RuntimeCode.Ref, `entry "${entryRef}" of "${receiver}" does not exist; treated as no logic`, parent?.id ?? null, null);
        entryRef = null;
      }
    }
    const info = this.startRun({ entryNodeId, entryRef, ctx, receiver, action, parent, dialogOwner, onEnd, emptyResult: found !== undefined });
    this.h.onEvent(info.id, action, receiver, ctx.flatten());
    return info;
  }

  /** zone.enter / zone.exit for a trigger zone (spec 03 C6); the zone id is the receiver label. */
  emitZoneEvent(actor: string, zoneId: string, entryRef: string | null, action: "zone.enter" | "zone.exit"): RunInfo {
    const ctx = ContextFrame.root({ $action: action, $actor: actor });
    const entryNodeId = entryRef === null ? null : (this.h.content.entries.get(entryRef) ?? null);
    if (entryRef !== null && entryNodeId === null) this.h.warn(RuntimeCode.Ref, `entry "${entryRef}" of zone "${zoneId}" does not exist`, null, null);
    const info = this.startRun({ entryNodeId, entryRef, ctx, receiver: zoneId, action, parent: null, dialogOwner: null, onEnd: () => {}, emptyResult: true });
    this.h.onEvent(info.id, action, zoneId, ctx.flatten());
    return info;
  }

  /** Scene transitions currently in progress (observability / idle checks). */
  activeTransitions(): TransitionState[] {
    return [...this.transitions.values()];
  }

  /** Start a run from an explicit entry ref (devtools/tests and dialog starts). */
  runEntry(entryRef: string, ctx: ContextFrame, parent: Run | null, dialogOwner: string | null, onEnd: (r: RunResult, run: RunInfo) => void): RunInfo {
    const nodeId = this.h.content.entries.get(entryRef) ?? this.synthetic.get(entryRef)?.node.id;
    if (nodeId === undefined) throw new EngineError(EngineErrorCode.UnknownEntry, `unknown entry "${entryRef}"`);
    return this.startRun({ entryNodeId: nodeId, entryRef, ctx, receiver: null, action: (ctx.get("$action") as string | undefined) ?? null, parent, dialogOwner, onEnd, emptyResult: true });
  }

  /** Sub-run for an action node; resumes `act` when it ends. */
  private eventFromAct(act: Act, receiver: string, action: string, values: Readonly<Record<string, Value | null>>, then: (r: RunResult) => void): void {
    this.emitEvent(receiver, action, values, act.run, (r) => {
      // Cancelling the parent run marks its activations done before child runs report "cancelled".
      if (act.status === "done") return;
      then(r);
    });
  }

  // ---------------------------------------------------------------------------
  // Joins (spec 02 B4.5, decision B-07)
  // ---------------------------------------------------------------------------

  /** Called when the work stack is empty: fire joins whose remaining incoming branches were pruned. */
  private checkJoins(): boolean {
    let fired = false;
    for (const run of this.runs) {
      for (const state of [...run.joins.values()]) {
        const anc = this.h.content.ancestors(state.nodeId);
        let blocked = false;
        for (const a of run.frontier) {
          if (anc.has(a.ixn.node.id)) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          this.fireJoin(run, state);
          fired = true;
        }
      }
    }
    return fired;
  }

  private fireJoin(run: Run, state: JoinState): void {
    run.joins.delete(state.nodeId);
    const [primary, ...followers] = state.arrivals as [Act, ...Act[]];
    this.h.tracer.emit("join.fire", { runId: run.id, nodeId: state.nodeId, arrivals: state.arrivals.length });
    primary.followers = followers;
    run.frontier.add(primary);
    this.proceed(primary);
  }

  // ---------------------------------------------------------------------------
  // Node execution
  // ---------------------------------------------------------------------------

  private execute(act: Act): void {
    if (act.status !== "queued") return;
    const outer = this.current;
    this.current = act.run;
    try {
      this.executeNode(act);
    } finally {
      this.current = outer;
    }
  }

  private executeNode(act: Act): void {
    act.status = "effect";
    const node = act.ixn.node;
    this.executions.set(node.id, (this.executions.get(node.id) ?? 0) + 1);
    this.h.tracer.emit("node.start", { runId: act.run.id, nodeId: node.id, type: node.type });
    const n = node as NodeDef;
    switch (n.type) {
      case "entry":
        if (n.modal === true) act.lock = this.h.modal.acquire(`entry:${n.id}`, act.run.id);
        this.proceed(act);
        return;
      case "guard":
        if (this.eval(act, n.expr)) this.proceed(act);
        else this.finish(act, true);
        return;
      case "return":
        this.finish(act, n.value);
        return;
      case "random":
        this.random(act);
        return;
      case "delay":
        this.delay(act, n.minMs, n.maxMs, n.mode);
        return;
      case "join":
        this.join(act);
        return;
      case "detach":
        this.finish(act, true);
        this.background(act);
        return;
      case "set":
        this.h.globals.set(n.var, n.value);
        this.h.tracer.emit("global.set", { runId: act.run.id, nodeId: n.id, name: n.var, value: n.value });
        this.h.onGlobalWrite(n.var, n.value);
        this.proceed(act);
        return;
      case "move_object":
        this.moveObject(act, n.object, n.to, n.spot ?? null);
        return;
      case "move_actor":
        this.moveActor(act, n.actor, n.scene, n.spot ?? null);
        return;
      case "set_variant":
        this.setVariant(act, n.entity, n.variant);
        return;
      case "rename":
        if (!this.h.world.rename(n.object, n.nameKey)) return this.refFail(act, `rename ${n.object}`);
        this.proceed(act);
        return;
      case "portal_lock":
        if (!this.h.world.setPortalLocked(n.portal, n.locked)) return this.refFail(act, `portal ${n.portal}`);
        this.proceed(act);
        return;
      case "player_set":
        if (!this.h.world.setPlayer(n.actor)) return this.refFail(act, `actor ${n.actor}`);
        this.proceed(act);
        return;
      case "interact":
        this.interact(act, n.object);
        return;
      case "walk_to":
        this.walkTo(act, n.actor, n.spot, n.scene ?? null);
        return;
      case "talk":
        this.talk(act, n.actor, n.target);
        return;
      case "use_item":
        this.useItem(act, n.item, n.target, n.kind);
        return;
      case "portal_use":
        this.portalUse(act, n.portal ?? null, n.toScene ?? null, n.actor ?? null);
        return;
      case "stop_walk":
        this.issue(act, act.run, (b) => ({ ...b, type: "StopWalk", actor: n.actor }), null);
        this.proceed(act);
        return;
      case "say":
        this.say(act, n.speaker, n.textKey);
        return;
      case "choice":
        this.choice(act);
        return;
      case "end_dialog":
        this.endDialog(act);
        return;
      case "dialog_push": {
        const ref = this.h.content.resolveEntry(n.entryName, act.ixn.graph.id);
        if (ref === undefined || !this.h.world.pushDialog(n.actor, this.entryRefOf(ref))) return this.refFail(act, `dialog_push ${n.actor} ${n.entryName}`);
        this.proceed(act);
        return;
      }
      case "dialog_pop":
        if (!this.h.world.actors.has(n.actor)) return this.refFail(act, `actor ${n.actor}`);
        if (!this.h.world.popDialog(n.actor)) this.warn(act, RuntimeCode.DialogPopLast, `dialog_pop on "${n.actor}" would remove the last entry; ignored`);
        this.proceed(act);
        return;
      case "play_animation": {
        const maxDuration = this.animationDef(n.entity, n.animation)?.maxDuration;
        this.await(
          act,
          (b) => ({ ...b, type: "PlayAnimation", entity: n.entity, animation: n.animation, loop: false, ...(maxDuration !== undefined ? { timeoutMs: maxDuration } : {}) }),
          () => this.proceed(act),
        );
        return;
      }
      case "sound_play": {
        const times = n.times ?? 1;
        const build = (b: { cmdId: string; runId: string; nodeId: string | null }): Command => ({
          ...b,
          type: "PlaySound",
          entity: n.entity,
          sound: n.sound,
          times,
          volume: n.volume ?? 1,
        });
        if (times === "loop") {
          // A looping sound completes immediately towards the logic (spec 02 B4.4).
          this.h.ambient.started({ entity: n.entity, sound: n.sound, volume: n.volume ?? 1 });
          this.issue(act, act.run, build, null);
          this.proceed(act);
        } else this.await(act, build, () => this.proceed(act));
        return;
      }
      case "sound_stop":
        this.h.ambient.stopped(n.entity, n.sound);
        this.issue(act, act.run, (b) => ({ ...b, type: "StopSound", entity: n.entity, sound: n.sound }), null);
        this.proceed(act);
        return;
      case "cutscene":
        // Scene and inventory input are locked while the cutscene plays (spec 06 F6, phase 4).
        act.lock = this.h.modal.acquire(`cutscene:${n.name}`, act.run.id);
        this.await(
          act,
          (b) => ({ ...b, type: "PlayCutscene", cutscene: n.name, language: this.h.world.language, hold: n.hold === true }),
          () => {
            if (act.lock !== null) this.h.modal.release(act.lock);
            act.lock = null;
            this.proceed(act);
          },
        );
        return;
      case "cutscene_clear":
        this.issue(act, act.run, (b) => ({ ...b, type: "ClearCutscene" }), null);
        this.proceed(act);
        return;
      case "input_lock":
        act.run.inputLocks.push(this.h.modal.acquire("input_lock", act.run.id));
        this.proceed(act);
        return;
      case "input_unlock": {
        const handle = act.run.inputLocks.pop();
        if (handle === undefined) this.warn(act, RuntimeCode.UnlockWithoutLock, "input_unlock without a matching input_lock in this run");
        else this.h.modal.release(handle);
        this.proceed(act);
        return;
      }
      case "quit":
        this.await(act, (b) => ({ ...b, type: "ShowCredits" }), () => {
          this.finish(act, true);
          this.h.sched.push(() => this.h.onQuit());
        });
        return;
      default: {
        const unknown = act.ixn.node as { type: string };
        this.warn(act, RuntimeCode.UnknownNode, `unknown node type "${unknown.type}"`);
        this.finish(act, false);
      }
    }
  }

  private refFail(act: Act, what: string): void {
    this.warn(act, RuntimeCode.Ref, `cannot resolve ${what}`);
    this.finish(act, false);
  }

  private eval(act: Act, expr: Parameters<typeof evaluateBool>[0]): boolean {
    const result = evaluateBool(
      expr,
      (name) => lookup(name, this.h.globals, act.ctx),
      (code, message) => this.warn(act, code, message),
    );
    this.h.tracer.emit("guard", { runId: act.run.id, nodeId: act.ixn.node.id, result });
    return result;
  }

  private entryRefOf(nodeId: string): string {
    const ixn = this.node(nodeId) as IndexedNode;
    return `${ixn.graph.id}#${(ixn.node as EntryNode).name}`;
  }

  private random(act: Act): void {
    const edges = this.sortedEdges(act.ixn.edges);
    if (edges.length === 0) {
      this.finish(act, true);
      return;
    }
    const chosen = edges[this.h.rng.int(edges.length)] as Edge;
    this.h.tracer.emit("random", { runId: act.run.id, nodeId: act.ixn.node.id, chosen: chosen.to });
    this.proceed(act, act.ctx, [chosen]);
  }

  private delay(act: Act, minMs: number, maxMs: number, mode: "block" | "background"): void {
    const ms = minMs === maxMs ? minMs : this.h.rng.intRange(minMs, maxMs);
    if (mode === "block") {
      this.timer(act, ms, () => {
        this.proceed(act);
        this.h.sched.drain();
      });
      return;
    }
    this.finish(act, true);
    this.timer(act, ms, () => {
      this.background(act);
      this.h.sched.drain();
    });
  }

  /** Run the successors of `act` detached from its parent (detach / background delay). */
  private background(act: Act): void {
    const holder = this.createAct(act.run, act.ixn, act.ctx, null, null, act.dialogOwner, false);
    holder.status = "effect";
    holder.background = true;
    this.h.tracer.emit("background", { runId: act.run.id, nodeId: act.ixn.node.id });
    this.proceed(holder);
  }

  private join(act: Act): void {
    const run = act.run;
    const id = act.ixn.node.id;
    let state = run.joins.get(id);
    if (state === undefined) {
      state = { nodeId: id, arrivals: [] };
      run.joins.set(id, state);
    }
    state.arrivals.push(act);
    run.frontier.delete(act);
    this.h.tracer.emit("join.arrive", { runId: run.id, nodeId: id, arrivals: state.arrivals.length });
    const expected = (this.h.content.incoming.get(id) ?? []).length;
    if (state.arrivals.length >= expected) this.fireJoin(run, state);
  }

  private moveObject(act: Act, object: string, to: ContainerRef, spot: string | null): void {
    if (!this.h.world.moveObject(object, to, spot)) {
      this.warn(act, RuntimeCode.MoveFailed, `move_object ${object} → ${JSON.stringify(to)} failed (unknown object or container)`);
      this.finish(act, false);
      return;
    }
    this.await(act, (b) => ({ ...b, type: "MoveObject", object, to }), () => this.proceed(act));
  }

  private setVariant(act: Act, entity: string, variant: string): void {
    const known = this.h.content.variantsOf(entity);
    if (known === undefined || !known.includes(variant)) return this.refFail(act, `variant ${variant} of ${entity}`);
    this.await(act, (b) => ({ ...b, type: "PrepareVariant", entity, variant }), () => {
      this.h.world.setVariant(entity, variant);
      this.proceed(act, act.ctx.extend({ $entity: entity, $variant: variant }));
    });
  }

  /** Animation definition behind `entity`'s animation name (current variant first, then any variant). */
  private animationDef(entity: string, name: string): AnimationDef | undefined {
    const c = this.h.content;
    const state = this.h.world.actors.get(entity) ?? this.h.world.objects.get(entity);
    if (state === undefined) return undefined;
    // Every actor/object in the world has its content definition.
    const def = (c.actors.get(entity) ?? c.objects.get(entity)) as { readonly variants: Readonly<Record<string, VariantDef>> };
    const id = def.variants[state.variant]?.animations?.[name] ?? Object.values(def.variants).find((v) => v.animations?.[name] !== undefined)?.animations?.[name];
    return id === undefined ? undefined : c.pkg.animations?.find((a) => a.id === id);
  }

  private currentScene(): string | null {
    const p = this.h.world.playerId;
    return p === null ? null : (this.h.world.actors.get(p) as ActorState).scene;
  }

  private interact(act: Act, object: string): void {
    this.eventFromAct(act, object, "interact", { $target: object, $scene: this.currentScene() }, (r) => {
      if (r === true) this.proceed(act);
      else this.finish(act, false);
    });
  }

  private useItem(act: Act, item: string, target: string, kind: UseKind): void {
    const values = { $item: item, $target: target, $scene: this.currentScene() };
    this.eventFromAct(act, item, `use.${kind}`, values, (r) => {
      if (r === true) this.proceed(act, act.ctx.extend({ $action: `use.${kind}`, ...values }));
      else this.finish(act, false);
    });
  }

  private walkTo(act: Act, actor: string, spot: string, scene: string | null): void {
    if (!this.h.world.actors.has(actor)) return this.refFail(act, `actor ${actor}`);
    this.walkThen(act, actor, spot, scene, (ok) => (ok ? this.proceed(act) : this.finish(act, false)));
  }

  /**
   * The `walk` event (veto), then the movement itself. Scenes with walk zones are
   * navigated by core (spec 03 C3/C4); scenes without walk zones keep the phase-1
   * contract and delegate walking to presentation via an awaited WalkTo command.
   */
  private walkThen(act: Act, actor: string, spot: string, scene: string | null, then: (ok: boolean) => void): void {
    const state = this.h.world.actors.get(actor) as ActorState;
    const sceneId = scene ?? state.scene;
    this.eventFromAct(act, actor, "walk", { $actor: actor, $scene: sceneId, $spot: spot }, (r) => {
      if (r !== true) return then(false);
      const space = this.h.nav.space(sceneId);
      if (space !== undefined && space.hasNavigation && state.scene === sceneId) {
        const target = space.spot(spot);
        if (target === null) {
          this.warn(act, RuntimeCode.Ref, `unknown spot "${spot}" in scene "${String(sceneId)}"`);
          return then(false);
        }
        const started = this.h.nav.walk(actor, target, act.run.id, (res) => {
          if (act.status === "done") return;
          if (res !== true) return then(false);
          this.h.world.setActorSpot(actor, spot);
          then(true);
        });
        if (!started) return then(false);
        this.markActivity(act.run);
        return;
      }
      this.await(act, (b) => ({ ...b, type: "WalkTo", actor, scene: sceneId, spot }), (reply) => {
        if (reply.kind === "failed") return then(false);
        this.h.world.setActorSpot(actor, spot);
        this.h.nav.placed(actor);
        then(true);
      });
    });
  }

  private moveActor(act: Act, actor: string, scene: string, spot: string | null): void {
    const state = this.h.world.actors.get(actor);
    if (state === undefined || !this.h.world.scenes.has(scene)) return this.refFail(act, `move_actor ${actor} → ${scene}`);
    if (actor === this.h.world.playerId && state.scene !== scene) {
      // The player changing scene runs the full scene transition (spec 02 B4.2 → 03 C7).
      this.transition(act, actor, null, scene, spot, () => this.proceed(act));
      return;
    }
    const left = state.scene !== scene;
    if (left) this.h.nav.leftScene(actor);
    this.h.world.moveActor(actor, scene, spot);
    if (left) this.h.nav.enteredScene(actor);
    else this.h.nav.placed(actor);
    this.await(act, (b) => ({ ...b, type: "MoveActor", actor, scene }), () => this.proceed(act));
  }

  private releaseTransition(act: Act): void {
    if (act.transitionLock !== null) {
      this.h.modal.release(act.transitionLock);
      act.transitionLock = null;
    }
    this.transitions.delete(act);
  }

  /**
   * Move `actor` to `toScene` (spec 03 C7). For the player:
   *   lock → [scene.exit($to) ∥ SceneFade out ∥ PortalTransition(preload)] → move + place on arrival
   *   → scene.enter($from) → zone enters → SceneFade in → unlock → then().
   * Other actors are moved directly after an awaited PortalTransition.
   */
  private transition(act: Act, actor: string, portalId: string | null, toScene: string, arrival: string | null, then: () => void): void {
    const world = this.h.world;
    // Actors that change scene through a portal or move_actor always stand in a scene.
    const fromScene = (world.actors.get(actor) as ActorState).scene as string;
    const transitionCmd = (b: { cmdId: string; runId: string; nodeId: string | null }): Command => ({ ...b, type: "PortalTransition", actor, portal: portalId, toScene });
    if (actor !== world.playerId) {
      this.await(act, transitionCmd, () => {
        this.h.nav.leftScene(actor);
        world.moveActor(actor, toScene, arrival);
        this.h.nav.enteredScene(actor);
        then();
      });
      return;
    }
    const state: TransitionState = { runId: act.run.id, actor, from: fromScene, to: toScene, phase: "exit" };
    this.releaseTransition(act);
    act.transitionLock = this.h.modal.acquire(`transition:${toScene}`, act.run.id);
    this.transitions.set(act, state);
    this.h.tracer.emit("transition", { runId: act.run.id, actor, from: fromScene, to: toScene, phase: "exit" });
    let pending = 3;
    const enter = (): void => {
      state.phase = "enter";
      this.h.tracer.emit("transition", { runId: act.run.id, actor, from: fromScene, to: toScene, phase: "enter" });
      this.h.ambient.sceneExit(fromScene, (e) => ownerScene(world, e));
      this.h.adapter.onSceneExit?.(fromScene);
      this.h.nav.leftScene(actor);
      world.moveActor(actor, toScene, arrival);
      // LIFO: scene.enter executes first, then zone enters, then the fade-in is issued.
      this.h.sched.push(() =>
        this.await(act, (b) => ({ ...b, type: "SceneFade", direction: "in", ms: 500 }), () => {
          this.releaseTransition(act);
          this.completedTransitions++;
          this.h.tracer.emit("transition", { runId: act.run.id, actor, from: fromScene, to: toScene, phase: "done" });
          then();
        }),
      );
      this.h.sched.push(() => this.h.nav.enteredScene(actor));
      this.emitEvent(toScene, "scene.enter", { $from: fromScene }, act.run, () => {});
    };
    const done = (): void => {
      pending--;
      if (pending === 0) enter();
    };
    this.eventFromAct(act, fromScene, "scene.exit", { $to: toScene }, done);
    this.await(act, (b) => ({ ...b, type: "SceneFade", direction: "out", ms: 500 }), done);
    this.await(act, transitionCmd, done);
  }

  private talk(act: Act, actor: string, target: string): void {
    if (!this.h.world.actors.has(target)) return this.refFail(act, `actor ${target}`);
    this.eventFromAct(act, actor, "talk", { $actor: actor, $target: target }, (r) => {
      if (r !== true) return this.finish(act, false);
      const top = this.h.world.topDialog(target);
      if (top === undefined) return this.proceed(act);
      const nodeId = this.h.content.entries.get(top);
      if (nodeId === undefined) return this.refFail(act, `dialog entry ${top}`);
      this.startRun({
        entryNodeId: nodeId,
        entryRef: top,
        ctx: ContextFrame.root({ $action: "talk", $actor: actor, $target: target }),
        receiver: target,
        action: "dialog",
        parent: act.run,
        dialogOwner: target,
        emptyResult: true,
        onEnd: (dr) => {
          if (act.status === "done") return;
          if (dr === true) this.proceed(act);
          else this.finish(act, false);
        },
      });
    });
  }

  /**
   * Portal use (spec 03 C8): locked → false (no logic) → portal.use (veto) → walk to
   * exitSpot → scene transition (arrival: arrivalSpot ?? reverse portal's exitSpot
   * ?? scene default) → walk to entrySpot → done.
   */
  private portalUse(act: Act, portal: string | null, toScene: string | null, actorParam: string | null): void {
    const actor = actorParam ?? this.h.world.playerId;
    if (actor === null || !this.h.world.actors.has(actor)) return this.refFail(act, "portal_use actor");
    if (portal === null) {
      const scene = toScene as string;
      if (!this.h.world.scenes.has(scene)) return this.refFail(act, `scene ${scene}`);
      this.transition(act, actor, null, scene, null, () => this.proceed(act));
      return;
    }
    const def = this.h.content.portals.get(portal);
    const state = this.h.world.portals.get(portal);
    if (def === undefined || state === undefined) return this.refFail(act, `portal ${portal}`);
    if (state.locked) {
      this.finish(act, false);
      return;
    }
    this.eventFromAct(act, portal, "portal.use", { $actor: actor, $portal: portal }, (r) => {
      if (r !== true) return this.finish(act, false);
      const afterExit = (ok: boolean): void => {
        if (!ok) return this.finish(act, false);
        const reverse = [...this.h.content.portals.values()].find((q) => q.from === def.to && q.to === def.from && (q.index ?? 0) === (def.index ?? 0));
        this.transition(act, actor, portal, def.to, def.arrivalSpot ?? reverse?.exitSpot ?? null, () => {
          if (def.entrySpot === undefined) return this.proceed(act);
          this.walkThen(act, actor, def.entrySpot, def.to, (entered) => (entered ? this.proceed(act) : this.finish(act, false)));
        });
      };
      const inFrom = (this.h.world.actors.get(actor) as ActorState).scene === def.from;
      if (def.exitSpot !== undefined && inFrom) this.walkThen(act, actor, def.exitSpot, def.from, afterExit);
      else afterExit(true);
    });
  }

  private say(act: Act, speaker: string, textKey: string): void {
    if (act.chosenOption && speaker === this.h.world.playerId) {
      // The player's own chosen option is not shown again (spec 02 B7).
      this.proceed(act);
      return;
    }
    this.await(act, (b) => ({ ...b, type: "Say", speaker, textKey }), () => this.proceed(act));
  }

  /**
   * Walk guards transparently from `edges` (spec 02 B7): true guards are expanded,
   * false guards prune; every other node is a terminal, returned in DFS order.
   */
  private walkTransparent(act: Act, edges: readonly Edge[]): IndexedNode[] {
    const out: IndexedNode[] = [];
    const seen = new Set<string>();
    const stack = [...this.sortedEdges(edges)].reverse();
    while (stack.length > 0) {
      const e = stack.pop() as Edge;
      const ixn = this.node(e.to);
      if (ixn === undefined) {
        this.warn(act, RuntimeCode.Ref, `edge to unknown node "${e.to}"`);
        continue;
      }
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      if (ixn.node.type === "guard") {
        const guarded = ixn.node;
        const ok = evaluateBool(
          guarded.expr,
          (name) => lookup(name, this.h.globals, act.ctx),
          (code, message) => this.warn(act, code, message),
        );
        this.h.tracer.emit("guard", { runId: act.run.id, nodeId: guarded.id, result: ok });
        if (ok) for (const ce of [...this.sortedEdges(ixn.edges)].reverse()) stack.push(ce);
      } else out.push(ixn);
    }
    return out;
  }

  private choice(act: Act): void {
    const terminals = this.walkTransparent(act, act.ixn.edges);
    const options = terminals.filter((t) => t.node.type === "say");
    const side = terminals.filter((t) => t.node.type !== "say");
    if (options.length === 0) {
      this.warn(act, RuntimeCode.ChoiceEmpty, `choice "${act.ixn.node.id}" has no available options`);
      this.spawn(act, side.map((ixn) => ({ ixn, chosen: false })), act.ctx);
      return;
    }
    const list: ChoiceOption[] = options.map((o) => {
      const say = o.node as Extract<NodeDef, { type: "say" }>;
      return { id: say.id, speaker: say.speaker, textKey: say.textKey };
    });
    this.await(act, (b) => ({ ...b, type: "Choose", options: list }), (reply) => {
      const chosen = options.find((o) => o.node.id === (reply as { optionId: string }).optionId) as IndexedNode;
      this.spawn(act, [...side.map((ixn) => ({ ixn, chosen: false })), { ixn: chosen, chosen: true }], act.ctx);
    });
  }

  private endDialog(act: Act): void {
    this.await(act, (b) => ({ ...b, type: "DialogEnd" }), () => {
      const terminals = this.walkTransparent(act, act.ixn.edges);
      const entries = terminals.filter((t) => t.node.type === "entry");
      const others = terminals.filter((t) => t.node.type !== "entry");
      const last = entries[entries.length - 1];
      if (last !== undefined) {
        const owner = act.dialogOwner ?? act.ixn.graph.owner ?? null;
        if (owner === null) this.warn(act, RuntimeCode.DialogNoOwner, "end_dialog has next entries but the dialog has no owner");
        else this.h.world.replaceTopDialog(owner, this.entryRefOf(last.node.id));
      }
      this.spawn(act, others.map((ixn) => ({ ixn, chosen: false })), act.ctx);
    });
  }
}

function edgesOf(node: NodeDef): Edge[] {
  return (node.next ?? []).map((e, position) => (typeof e === "string" ? { to: e, order: 0, position } : { to: e.to, order: e.order ?? 0, position }));
}

export { roundTime };
