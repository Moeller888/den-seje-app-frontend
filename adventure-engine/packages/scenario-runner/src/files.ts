import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Scenario } from "./runner.ts";

const here = dirname(fileURLToPath(import.meta.url));
export const SCENARIO_DIR = join(here, "..", "scenarios");
export const GOLDEN_DIR = join(here, "..", "golden");
export const FIXTURE_DIR = join(here, "..", "fixtures");

/** Raw text of a save fixture (phase 5, TS-E07). */
export function readFixture(name: string): string {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`invalid fixture name "${name}"`);
  return readFileSync(join(FIXTURE_DIR, `${name}.json`), "utf8");
}

/** Content of another scenario file, for `contentRef` (phase 5). */
export function readScenarioContent(ref: string): unknown {
  if (!/^[a-z0-9-]+\.json$/.test(ref)) throw new Error(`invalid contentRef "${ref}"`);
  return (JSON.parse(readFileSync(join(SCENARIO_DIR, ref), "utf8")) as { content?: unknown }).content;
}

/** Scenarios that phase 1 must run green (task scope). */
export const PHASE1_SCENARIOS = [
  "graph-parallel-guards",
  "graph-async-order",
  "graph-veto-and-return",
  "dialog-choice-and-stack",
] as const;

/** Scenarios added in phase 2 (world, camera, movement). */
export const PHASE2_SCENARIOS = ["scene-portal-transition", "world-movement"] as const;

/** Scenarios added in phase 3 (interaction and UI). */
export const PHASE3_SCENARIOS = ["interaction-inventory-combine"] as const;

/** Scenarios added in phase 4 (animation, sound, cutscenes). */
export const PHASE4_SCENARIOS = ["media-animation-sound-cutscene"] as const;

/** Scenarios added in phase 5 (save/load). */
export const PHASE5_SCENARIOS = ["save-roundtrip-and-corrupt"] as const;

/** Every scenario that must run green and match its golden trace. */
export const SUPPORTED_SCENARIOS: readonly string[] = [...PHASE1_SCENARIOS, ...PHASE2_SCENARIOS, ...PHASE3_SCENARIOS, ...PHASE4_SCENARIOS, ...PHASE5_SCENARIOS];

export function listScenarios(): string[] {
  return readdirSync(SCENARIO_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
}

export function readScenario(name: string): Scenario {
  return JSON.parse(readFileSync(join(SCENARIO_DIR, `${name}.json`), "utf8")) as Scenario;
}

export function goldenPath(name: string): string {
  return join(GOLDEN_DIR, `${name}.trace.jsonl`);
}

export function readGolden(name: string): string | null {
  const p = goldenPath(name);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

export function writeGolden(name: string, trace: string): void {
  mkdirSync(GOLDEN_DIR, { recursive: true });
  writeFileSync(goldenPath(name), trace, "utf8");
}
