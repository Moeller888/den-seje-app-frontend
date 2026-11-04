import { loadContent, type ContentPackage, type GraphDef, type LoadMode, type NodeDef } from "@adventure-engine/content";
import { Engine, type Command, type CommandType, type Disposition, type PresentationAdapter } from "../src/index.ts";

/** Records commands; awaits the listed types, auto-completes the rest after `autoMs`. */
export class TestAdapter implements PresentationAdapter {
  readonly log: Command[] = [];
  private readonly awaitTypes: ReadonlySet<CommandType>;
  private readonly autoMs: number;

  constructor(awaitTypes: readonly CommandType[] = [], autoMs = 0) {
    this.awaitTypes = new Set(awaitTypes);
    this.autoMs = autoMs;
  }

  onCommand(command: Command): Disposition {
    this.log.push(command);
    return this.awaitTypes.has(command.type) ? { kind: "await" } : { kind: "auto", afterMs: this.autoMs };
  }

  types(): string[] {
    return this.log.map((c) => c.type);
  }
}

/** Minimal synthetic world: one scene, a player and a second actor. */
export function basePackage(graphs: GraphDef[], extra: Partial<ContentPackage> = {}): ContentPackage {
  const actors = extra.actors ?? [
    { id: "hero", scene: "room", spot: "a", entry: null, variants: { default: {} } },
    { id: "owl", scene: "room", spot: "b", entry: null, variants: { default: {}, wet: {} } },
    { id: "fox", scene: "room", spot: "b", entry: null, variants: { default: {} } },
  ];
  const objects = extra.objects ?? [
    { id: "box", container: { kind: "scene", id: "room" } as const, entry: null, variants: { default: {}, open: {} } },
    { id: "key", container: { kind: "actor", id: "hero" } as const, entry: null, variants: { default: {} } },
  ];
  const hasActor = (id: string): boolean => actors.some((a) => a.id === id);
  const hasEntity = (id: string): boolean => hasActor(id) || objects.some((o) => o.id === id);
  return {
    game: extra.game ?? {
      id: "t",
      version: "0.0.1",
      formatVersion: 1,
      languages: ["da"],
      defaultLanguage: "da",
      player: { actor: "hero" },
      entry: null,
      globals: {},
    },
    scenes: extra.scenes ?? [
      {
        id: "room",
        entry: null,
        variants: ["default", "dark"],
        spots: { a: { x: 10, y: 10 }, b: { x: 20, y: 10 } },
        defaultSpot: "a",
        objectZones: [{ entity: "box", polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] as const }].filter((z) => hasEntity(z.entity)),
        actorZones: [
          { actor: "owl", polygon: [[20, 0], [30, 0], [30, 10], [20, 10]] as const },
          { actor: "fox", talkSpot: "b", polygon: [[40, 0], [50, 0], [50, 10], [40, 10]] as const },
        ].filter((z) => hasActor(z.actor)),
      },
      { id: "yard2", entry: null, spots: { gate: { x: 1, y: 1 } }, defaultSpot: "gate" },
    ],
    actors,
    objects,
    portals: extra.portals ?? [],
    graphs,
    i18n: extra.i18n ?? { da: { t1: "a", t2: "b", t3: "c" } },
  };
}

export function graph(id: string, nodes: NodeDef[], kind: "logic" | "dialog" = "logic"): GraphDef {
  return { id, kind, nodes };
}

export interface Harness {
  readonly engine: Engine;
  readonly adapter: TestAdapter;
}

export function harness(
  pkg: ContentPackage,
  opts: { await?: readonly CommandType[]; autoMs?: number; mode?: LoadMode; seed?: string; devMode?: boolean; watchdogMs?: number } = {},
): Harness {
  const content = loadContent(pkg, { mode: opts.mode ?? "strict" });
  const adapter = new TestAdapter(opts.await ?? [], opts.autoMs ?? 0);
  const engine = new Engine(content, {
    seed: opts.seed ?? "test",
    adapter,
    devMode: opts.devMode ?? false,
    ...(opts.watchdogMs !== undefined ? { watchdogMs: opts.watchdogMs } : {}),
  });
  return { engine, adapter };
}

/** Pending command of a given type (exactly one expected). */
export function pending(engine: Engine, type: CommandType, nodeId?: string): Command {
  const list = engine.pendingCommands().filter((c) => c.type === type && (nodeId === undefined || c.nodeId === nodeId));
  if (list.length !== 1) throw new Error(`expected one pending ${type}${nodeId ? ` for ${nodeId}` : ""}, found ${list.length}`);
  return list[0] as Command;
}

export function lastResult(engine: Engine): unknown {
  return engine.finishedRuns[engine.finishedRuns.length - 1]?.result;
}
