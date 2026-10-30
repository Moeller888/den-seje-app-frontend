/**
 * Deterministic animation program player (spec 06 F3, phase 4).
 *
 * Timing (see content/media.ts): frame/fps/layer/layerPop/signal are instant;
 * play(a, b) shows each frame for 1/fps; wait(k) holds for k/fps; loopRange
 * repeats forever; `loop: true` restarts the whole program.
 *
 * Layers: frame changes apply to the layer on top of the layer stack ("" is
 * the base). A layer keeps its last frame after layerPop; the stack only
 * selects which layer the next frame instructions change.
 *
 * Events: `onSignal` for each executed signal (never during a silent seek),
 * `onLoop` once when the program becomes endless, `onDone` when a finite
 * program ends. Nothing is emitted after `stop()`.
 */

import { DEFAULT_ANIMATION_FPS, type AnimInstr, type AnimationDef } from "@adventure-engine/content";
import { ManualClock, type Clock } from "./clock.ts";

export type PlayerStatus = "idle" | "playing" | "looping" | "done" | "stopped";

export interface PlayerEvents {
  onSignal?(entity: string, name: string): void;
  onLoop?(): void;
  onDone?(): void;
}

export interface PlayerState {
  readonly status: PlayerStatus;
  /** Frame of the base layer. */
  readonly frame: number;
  readonly fps: number;
  /** Layer the next frame instructions change ("" = base). */
  readonly layer: string;
  readonly layerStack: readonly string[];
  /** Last frame of every layer that has shown one ("" = base). */
  readonly frames: Readonly<Record<string, number>>;
  /** Index of the instruction being executed or next to execute. */
  readonly pc: number;
}

export interface StartOptions {
  /** Silent seek: run instructions 0 … at−1 without time, signals or events (TS-F03). */
  readonly at?: number;
  /** Start an endless loopRange at this normalised phase in [0, 1) (keeps the walk cycle on facing changes). */
  readonly loopPhase?: number;
}

export class AnimationPlayer {
  readonly def: AnimationDef;
  private readonly clock: Clock;
  private readonly ev: PlayerEvents;
  private status_: PlayerStatus = "idle";
  private fps: number;
  private stack: string[] = [];
  private frames: Record<string, number> = {};
  private pc = 0;
  /** Step inside the current play/loopRange. */
  private step = 0;
  private timer: number | null = null;
  private loopAnnounced = false;

  constructor(def: AnimationDef, clock: Clock, events: PlayerEvents = {}) {
    this.def = def;
    this.clock = clock;
    this.ev = events;
    this.fps = def.defaultFps ?? DEFAULT_ANIMATION_FPS;
  }

  get state(): PlayerState {
    return {
      status: this.status_,
      frame: this.frames[""] ?? 0,
      fps: this.fps,
      layer: this.stack[this.stack.length - 1] ?? "",
      layerStack: [...this.stack],
      frames: { ...this.frames },
      pc: this.pc,
    };
  }

  get status(): PlayerStatus {
    return this.status_;
  }

  /** Normalised position in an active loopRange, else null. */
  loopPhase(): number | null {
    const ins = this.def.instructions[this.pc];
    if (this.status_ !== "looping" || ins?.op !== "loopRange") return null;
    return this.step / (Math.abs(ins.to - ins.from) + 1);
  }

  /**
   * TS-F03: the state just before instruction `at`, reached silently (no time,
   * no signals, no events). `start({ at })` continues from exactly this state.
   */
  static stateAt(def: AnimationDef, at: number): PlayerState {
    // A seek never waits, so the clock is never used.
    const p = new AnimationPlayer(def, new ManualClock());
    p.seek(at);
    return p.state;
  }

  private seek(at: number): void {
    const end = Math.max(0, Math.min(at, this.def.instructions.length));
    for (let i = 0; i < end; i++) this.silent(this.def.instructions[i] as AnimInstr);
    this.pc = end;
  }

  start(options: StartOptions = {}): void {
    if (this.status_ !== "idle") throw new Error("an AnimationPlayer can only be started once");
    this.status_ = "playing";
    this.seek(options.at ?? 0);
    const loopAt = this.def.instructions.findIndex((x) => x.op === "loopRange");
    if (options.loopPhase !== undefined && loopAt >= this.pc) {
      for (let i = this.pc; i < loopAt; i++) this.silent(this.def.instructions[i] as AnimInstr);
      this.pc = loopAt;
      const ins = this.def.instructions[loopAt] as Extract<AnimInstr, { op: "loopRange" }>;
      const n = Math.abs(ins.to - ins.from) + 1;
      this.step = Math.floor(((options.loopPhase % 1) + 1) % 1 * n) % n;
    }
    if (this.def.loop === true) this.announceLoop();
    this.run();
  }

  stop(): void {
    if (this.timer !== null) this.clock.clearTimer(this.timer);
    this.timer = null;
    if (this.status_ !== "done") this.status_ = "stopped";
  }

  private active(): boolean {
    return this.status_ === "playing" || this.status_ === "looping";
  }

  private setFrame(n: number): void {
    this.frames[this.stack[this.stack.length - 1] ?? ""] = n;
  }

  /** Apply an instruction's end state without time or signals. */
  private silent(ins: AnimInstr): void {
    switch (ins.op) {
      case "frame":
        return this.setFrame(ins.n);
      case "play":
        return this.setFrame(ins.to);
      case "loopRange":
        return this.setFrame(ins.from);
      case "fps":
        this.fps = ins.n;
        return;
      case "layer":
        this.stack.push(ins.name);
        return;
      case "layerPop":
        this.stack.pop();
        return;
      default:
        return;
    }
  }

  private announceLoop(): void {
    if (this.loopAnnounced) return;
    this.loopAnnounced = true;
    this.status_ = "looping";
    this.ev.onLoop?.();
  }

  private wait(frames: number, then: () => void): void {
    this.timer = this.clock.setTimer((frames * 1000) / this.fps, () => {
      this.timer = null;
      then();
    });
  }

  /** Execute instant instructions until something takes time or the program ends. */
  private run(): void {
    // Defensive: an endless program without any timed instruction (rejected by validation) must not spin.
    let wrapped = false;
    while (this.active()) {
      const ins = this.def.instructions[this.pc];
      if (ins === undefined) {
        if (this.def.loop === true && !wrapped) {
          wrapped = true;
          this.pc = 0;
          continue;
        }
        this.status_ = "done";
        this.ev.onDone?.();
        return;
      }
      switch (ins.op) {
        case "frame":
        case "fps":
        case "layer":
        case "layerPop":
          this.silent(ins);
          this.pc++;
          continue;
        case "signal":
          this.pc++;
          this.ev.onSignal?.(ins.entity, ins.name);
          continue;
        case "wait":
          this.wait(ins.frames, () => {
            this.pc++;
            this.run();
          });
          return;
        case "play":
        case "loopRange": {
          const n = Math.abs(ins.to - ins.from) + 1;
          const dir = ins.to >= ins.from ? 1 : -1;
          if (ins.op === "loopRange") this.announceLoop();
          // onLoop may have stopped this player.
          if (!this.active()) return;
          this.setFrame(ins.from + dir * this.step);
          this.wait(1, () => {
            this.step++;
            if (this.step >= n) {
              this.step = 0;
              if (ins.op === "play") this.pc++;
            }
            this.run();
          });
          return;
        }
      }
    }
  }
}
