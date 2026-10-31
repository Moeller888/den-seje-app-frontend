/**
 * Movement, trigger zones and scroll (spec 03 C3/C5/C6), driven by the 60 Hz
 * logic tick of the Scheduler. Headless and deterministic.
 *
 * - A walk follows a path from SceneSpace.findPath. Each tick an actor advances
 *   speed/60 units along it: floor units when the scene has a camera (and every
 *   waypoint lies below the horizon), otherwise scene pixels. Leftover distance
 *   carries over to the next segment within the same tick, so very short
 *   segments are passed without stalling; the final waypoint is reached exactly.
 * - Facing is taken from each segment's direction in scene coordinates.
 * - Trigger zones are tested on every movement sub-segment with segment
 *   crossings, so a thin zone crossed within one tick yields enter then exit.
 */
import type { Facing, LoadedContent, TriggerZoneDef } from "@adventure-engine/content";
import { distance, lerp, pointInPolygon, pointsNearlyEqual, zoneTransitions, type Vec2, type Vec3 } from "@adventure-engine/geometry";
import type { Scheduler } from "./scheduler.ts";
import { TICK_HZ, TICK_MS } from "./scheduler.ts";
import { facingFromDelta, type SceneSpace, type Spaces } from "./space.ts";
import type { Tracer } from "./trace.ts";
import type { ActorState, WorldState } from "./world.ts";

export type WalkResult = true | false | "cancelled";

export interface NavigatorHost {
  readonly content: LoadedContent;
  readonly sched: Scheduler;
  readonly tracer: Tracer;
  readonly spaces: Spaces;
  world(): WorldState;
  /** Deliver zone.enter / zone.exit to the zone's entry. */
  emitZoneEvent(actor: string, sceneId: string, zone: TriggerZoneDef, action: "zone.enter" | "zone.exit"): void;
}

interface Job {
  readonly actor: string;
  readonly scene: string;
  readonly points: readonly Vec2[];
  readonly floor: readonly Vec3[] | null;
  readonly lengths: readonly number[];
  readonly perTick: number;
  readonly runId: string | null;
  readonly onDone: (r: WalkResult) => void;
  readonly startTick: number;
  seg: number;
  along: number;
}

const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const rp = (p: Vec2): [number, number] => [r3(p[0]), r3(p[1])];

export class Navigator {
  private readonly h: NavigatorHost;
  private readonly jobs = new Map<string, Job>();
  private tickTimer: number | null = null;
  private readonly actorOrder: Map<string, number>;

  constructor(host: NavigatorHost) {
    this.h = host;
    this.actorOrder = new Map((host.content.pkg.actors ?? []).map((a, i) => [a.id, i]));
  }

  space(sceneId: string | null): SceneSpace | undefined {
    return sceneId === null ? undefined : this.h.spaces.get(sceneId);
  }

  isMoving(actor: string): boolean {
    return this.jobs.has(actor);
  }

  get movingCount(): number {
    return this.jobs.size;
  }

  /**
   * Start walking `actor` (in its current scene) to `target`. Returns false (and
   * does not call onDone) if there is no navigation or no path. A previous walk
   * of the same actor is cancelled first.
   */
  walk(actor: string, target: Vec2, runId: string | null, onDone: (r: WalkResult) => void): boolean {
    // Callers guarantee: the actor exists and stands in a scene with navigation.
    const st = this.h.world().actors.get(actor) as ActorState;
    const space = this.space(st.scene) as SceneSpace;
    if (!space.belowHorizon(target)) {
      // A target above the horizon never starts movement (TS-C02).
      this.h.tracer.emit("walk.nopath", { actor, scene: space.id, from: null, to: rp(target), reason: "above-horizon" });
      return false;
    }
    const from = st.pos ?? target;
    const path = space.findPath(from, target);
    if (path === null) {
      this.h.tracer.emit("walk.nopath", { actor, scene: space.id, from: rp(from), to: rp(target) });
      return false;
    }
    this.cancel(actor);
    const points = pointsNearlyEqual(from, path.points[0] as Vec2) ? path.points : [from, ...path.points];
    const floor = this.floorPath(space, points);
    const lengths: number[] = [];
    for (let i = 0; i + 1 < points.length; i++) {
      lengths.push(floor !== null ? floorDistance(floor[i] as Vec3, floor[i + 1] as Vec3) : distance(points[i] as Vec2, points[i + 1] as Vec2));
    }
    const job: Job = {
      actor,
      scene: space.id,
      points,
      floor,
      lengths,
      perTick: space.speed / TICK_HZ,
      runId,
      onDone,
      startTick: this.h.sched.tick,
      seg: 0,
      along: 0,
    };
    this.jobs.set(actor, job);
    this.h.tracer.emit("walk.start", {
      actor,
      scene: space.id,
      runId,
      path: points.map(rp),
      length: r3(lengths.reduce((a, b) => a + b, 0)),
      units: floor !== null ? "floor" : "scene",
    });
    this.ensureTick();
    return true;
  }

  /** Stop the actor's walk where it is; the walk completes with "cancelled". */
  cancel(actor: string): void {
    const job = this.jobs.get(actor);
    if (job === undefined) return;
    this.finish(job, "cancelled");
  }

  /** Stop all walks owned by a run (used by run cancellation; onDone results are ignored by the run). */
  cancelRun(runId: string): void {
    for (const job of [...this.jobs.values()]) if (job.runId === runId) this.finish(job, "cancelled");
  }

  cancelAll(): void {
    for (const job of [...this.jobs.values()]) this.finish(job, "cancelled");
  }

  private finish(job: Job, result: WalkResult): void {
    this.jobs.delete(job.actor);
    const st = this.h.world().actors.get(job.actor) as ActorState;
    this.h.tracer.emit("walk.end", {
      actor: job.actor,
      result,
      pos: st.pos === null ? null : rp(st.pos),
      ticks: this.h.sched.tick - job.startTick,
    });
    this.traceScroll();
    job.onDone(result);
  }

  private floorPath(space: SceneSpace, points: readonly Vec2[]): Vec3[] | null {
    if (space.camera === null) return null;
    const out: Vec3[] = [];
    for (const p of points) {
      const f = space.camera.screenToFloor(p);
      if (f === null) return null;
      out.push(f);
    }
    return out;
  }

  private ensureTick(): void {
    if (this.tickTimer !== null || this.jobs.size === 0) return;
    const next = (this.h.sched.tick + 1) * TICK_MS - this.h.sched.now;
    this.tickTimer = this.h.sched.setTimer(Math.max(0, next), () => {
      this.tickTimer = null;
      this.step();
      this.ensureTick();
    });
  }

  /** One logic tick for every walking actor, in content order. */
  private step(): void {
    // Zone events only queue runs, so no job can be replaced while the tick is processed.
    const jobs = [...this.jobs.values()].sort((a, b) => (this.actorOrder.get(a.actor) as number) - (this.actorOrder.get(b.actor) as number));
    for (const job of jobs) this.advance(job);
  }

  private advance(job: Job): void {
    const world = this.h.world();
    let remaining = job.perTick;
    const last = job.points.length - 1;
    while (job.seg < last) {
      const segLen = job.lengths[job.seg] as number;
      // Path waypoints are distinct, so every segment has a direction.
      const facing = facingFromDelta(
        (job.points[job.seg + 1] as Vec2)[0] - (job.points[job.seg] as Vec2)[0],
        (job.points[job.seg + 1] as Vec2)[1] - (job.points[job.seg] as Vec2)[1],
      ) as Facing;
      const before = (world.actors.get(job.actor) as ActorState).pos as Vec2;
      const left = segLen - job.along;
      if (remaining >= left) {
        // Reach the segment end exactly; carry the rest over.
        remaining -= left;
        job.seg++;
        job.along = 0;
        this.moveTo(job, before, job.points[job.seg] as Vec2, facing);
        if (remaining <= 0) break;
        continue;
      }
      job.along += remaining;
      const t = job.along / segLen;
      // Floor mode: interpolate on the floor and project back (a floor segment below the horizon stays below it).
      const pos =
        job.floor !== null
          ? (((this.h.spaces.get(job.scene) as SceneSpace).camera as NonNullable<SceneSpace["camera"]>).floorToScreen(
              lerp3(job.floor[job.seg] as Vec3, job.floor[job.seg + 1] as Vec3, t),
            ) as Vec2)
          : lerp(job.points[job.seg] as Vec2, job.points[job.seg + 1] as Vec2, t);
      this.moveTo(job, before, pos, facing);
      remaining = 0;
      break;
    }
    if (job.seg >= last) this.finish(job, true);
  }

  private moveTo(job: Job, from: Vec2, to: Vec2, facing: Facing): void {
    this.h.world().stepActor(job.actor, to, facing);
    this.crossZones(job.actor, from, to);
    this.updateScroll(job.actor);
  }

  // ---------------------------------------------------------------------------
  // Trigger zones (spec 03 C6)
  // ---------------------------------------------------------------------------

  /** Actors that trigger zones: `triggersZones`, defaulting to "is the player". */
  triggers(actor: string): boolean {
    const def = this.h.content.actors.get(actor);
    return def?.triggersZones ?? actor === this.h.world().playerId;
  }

  private zones(sceneId: string | null): readonly TriggerZoneDef[] {
    return this.space(sceneId)?.def.triggerZones ?? [];
  }

  activeZones(actor: string): readonly string[] {
    return this.h.world().activeZones.get(actor) ?? [];
  }

  private setActive(actor: string, list: string[]): void {
    if (list.length === 0) this.h.world().activeZones.delete(actor);
    else this.h.world().activeZones.set(actor, list);
  }

  /** Movement along a segment: enter/exit in order of crossing (ties: zone content order). */
  private crossZones(actor: string, a: Vec2, b: Vec2): void {
    if (!this.triggers(actor)) return;
    const scene = (this.h.world().actors.get(actor) as ActorState).scene as string;
    const zones = this.zones(scene);
    const events: Array<{ t: number; zone: number; inside: boolean }> = [];
    zones.forEach((z, zone) => {
      for (const tr of zoneTransitions(a, b, z.polygon)) events.push({ t: tr.t, zone, inside: tr.inside });
    });
    events.sort((x, y) => x.t - y.t || x.zone - y.zone);
    for (const e of events) this.applyZone(actor, scene, zones[e.zone] as TriggerZoneDef, e.inside);
  }

  private applyZone(actor: string, sceneId: string, zone: TriggerZoneDef, inside: boolean): void {
    const active = [...this.activeZones(actor)];
    const has = active.includes(zone.id);
    // Defensive guard (documented coverage exception): membership always equals the
    // geometric state at the start of a step, so a transition never repeats a state.
    if (inside === has) return;
    const zones = this.zones(sceneId).map((z) => z.id);
    const next = inside ? zones.filter((id) => id === zone.id || active.includes(id)) : active.filter((id) => id !== zone.id);
    this.setActive(actor, next);
    this.h.tracer.emit("zone", { actor, scene: sceneId, zone: zone.id, change: inside ? "enter" : "exit" });
    this.h.emitZoneEvent(actor, sceneId, zone, inside ? "zone.enter" : "zone.exit");
  }

  /**
   * Instant placement inside the same scene: exits first, then enters, each in
   * zone content order. Re-placing on the same spot or edge produces no events.
   */
  placed(actor: string): void {
    const st = this.h.world().actors.get(actor) as ActorState;
    if (this.triggers(actor) && st.pos !== null && st.scene !== null) {
      const pos = st.pos;
      const zones = this.zones(st.scene);
      const active = this.activeZones(actor);
      for (const z of zones) if (active.includes(z.id) && !pointInPolygon(pos, z.polygon)) this.applyZone(actor, st.scene, z, false);
      for (const z of zones) if (!this.activeZones(actor).includes(z.id) && pointInPolygon(pos, z.polygon)) this.applyZone(actor, st.scene, z, true);
    }
    this.updateScroll(actor);
    this.traceScroll();
  }

  /**
   * After a load (spec 05 E4): zone membership and scroll follow the restored
   * position without zone events (the saved state already reflects them).
   */
  restored(actor: string): void {
    const st = this.h.world().actors.get(actor) as ActorState;
    const pos = st.pos;
    this.h.world().activeZones.delete(actor);
    if (this.triggers(actor) && pos !== null && st.scene !== null) {
      this.setActive(actor, this.zones(st.scene).filter((z) => pointInPolygon(pos, z.polygon)).map((z) => z.id));
    }
    this.updateScroll(actor);
    this.traceScroll();
  }

  /** Leaving a scene: forget memberships without zone.exit (spec 03 C6.4). */
  leftScene(actor: string): void {
    this.cancel(actor);
    this.h.world().activeZones.delete(actor);
  }

  /**
   * After `scene.enter`: snap the scroll and enter every zone the actor already
   * stands in (spec 03 C6.4/C7).
   */
  enteredScene(actor: string): void {
    this.h.world().activeZones.delete(actor);
    this.placed(actor);
  }

  // ---------------------------------------------------------------------------
  // Scroll (spec 03 C5)
  // ---------------------------------------------------------------------------

  private lastTracedScroll: number | null = 0;

  private updateScroll(actor: string): void {
    const world = this.h.world();
    if (actor !== world.playerId) return;
    // The player always stands in a scene (E-PLAYER-SCENE); it may lack a position.
    const st = world.actors.get(actor) as ActorState;
    if (st.pos === null) return;
    world.scrollX = (this.space(st.scene) as SceneSpace).scrollFor(st.pos[0]);
  }

  private traceScroll(): void {
    const x = r3(this.h.world().scrollX);
    if (x === this.lastTracedScroll) return;
    this.lastTracedScroll = x;
    this.h.tracer.emit("scroll", { x });
  }

  /** Reset per-session caches (new game / load). */
  reset(): void {
    this.cancelAll();
    this.lastTracedScroll = 0;
  }
}

function floorDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
