import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent } from "@adventure-engine/content";
import { Engine } from "@adventure-engine/core";
import { HeadlessAdapter } from "@adventure-engine/scenario-runner";
import { describe, expect, it } from "vitest";
import { CONTEXT_KEY, DRAWER_KEY, DRAWER_RESULT_ACTION, RESULT_ACTION, TASK_REQUEST_GLOBAL, archiveContent } from "../src/content.ts";
import { INTRO_CARDS, INTRO_CHECK, wordCount } from "../src/intro-content.ts";

/** Headless run of the Arkivskabet scene (D-307): speech is confirmed, time runs until the world is idle. */
function world() {
  const engine = new Engine(loadContent(archiveContent), { seed: "arkiv", adapter: new HeadlessAdapter() });
  const settle = (): string[] => {
    const said: string[] = [];
    for (let i = 0; i < 2000; i++) {
      for (const c of engine.pendingCommands()) {
        if (c.type === "Say") said.push(c.textKey);
        engine.reply(c.cmdId, { kind: "done" });
      }
      if (engine.idleReport().idle) return said;
      engine.advanceTicks(1);
    }
    throw new Error("the scene did not become idle");
  };
  engine.newGame();
  engine.event("$game", "game.start");
  settle();
  return { engine, settle };
}

describe("Arkivskabet scene (D-307) — headless", () => {
  it("the content loads without errors", () => {
    expect(() => loadContent(archiveContent)).not.toThrow();
  });

  it("using the locked cabinet asks for a task at the decision point, and nothing else does", () => {
    const { engine, settle } = world();
    expect(engine.globals.get(TASK_REQUEST_GLOBAL)).toBe("");
    engine.event("cabinet", "interact");
    expect(settle()).toEqual(["line.cabinet_locked"]);
    expect(engine.globals.get(TASK_REQUEST_GLOBAL)).toBe(CONTEXT_KEY);
  });

  it("the server's 'correct' opens the cabinet; the drawer then asks for a NEW application task (phase 6)", () => {
    const { engine, settle } = world();
    engine.event("cabinet", RESULT_ACTION, { $outcome: "correct" });
    expect(settle()).toEqual(["line.unlocked"]);
    expect(engine.world.objects.get("cabinet")?.variant).toBe("open");
    expect(engine.globals.get("cabinet_open")).toBe(true);
    engine.event("cabinet", "interact");
    expect(settle()).toEqual(["line.drawer"]);
    expect(engine.globals.get(TASK_REQUEST_GLOBAL)).toBe(DRAWER_KEY);
  });

  it("the drawer's verdict: 'incorrect' keeps it open for another try, 'correct' closes the sequence", () => {
    const { engine, settle } = world();
    engine.event("cabinet", RESULT_ACTION, { $outcome: "correct" });
    settle();
    engine.event("cabinet", DRAWER_RESULT_ACTION, { $outcome: "incorrect" });
    expect(settle()).toEqual(["line.drawer_wrong"]);
    expect(engine.globals.get("transfer_done")).toBe(false);
    engine.event("cabinet", DRAWER_RESULT_ACTION, { $outcome: "correct" });
    expect(settle()).toEqual(["line.drawer_done"]);
    expect(engine.globals.get("transfer_done")).toBe(true);
    engine.setGlobal(TASK_REQUEST_GLOBAL, "");
    engine.event("cabinet", "interact");
    expect(settle()).toEqual(["line.cabinet_is_open"]);
    expect(engine.globals.get(TASK_REQUEST_GLOBAL)).toBe("");
  });

  it("the drawer's verdict does not touch the cabinet, and the cabinet's does not touch the drawer", () => {
    const { engine, settle } = world();
    engine.event("cabinet", DRAWER_RESULT_ACTION, { $outcome: "correct" });
    settle();
    expect(engine.globals.get("cabinet_open")).toBe(false);
    expect(engine.world.objects.get("cabinet")?.variant).toBe("default");
  });

  it("'incorrect' and 'aborted' leave the cabinet locked, each with its own line", () => {
    for (const [outcome, line] of [["incorrect", "line.still_locked"], ["aborted", "line.connection"]] as const) {
      const { engine, settle } = world();
      engine.event("cabinet", RESULT_ACTION, { $outcome: outcome });
      expect(settle()).toEqual([line]);
      expect(engine.world.objects.get("cabinet")?.variant).toBe("default");
      expect(engine.globals.get("cabinet_open")).toBe(false);
    }
  });

  it("the game's world state has no learning field (mastery, XP and evidence live on the server)", () => {
    const keys = Object.keys(archiveContent.game.globals ?? {});
    expect(keys.sort()).toEqual(["cabinet_open", "intro_seen", TASK_REQUEST_GLOBAL, "transfer_done"].sort());
    // No answer key (option ids live on the host) and no learning or reward field anywhere in the content.
    expect(JSON.stringify(archiveContent)).not.toMatch(/kilde_|"xp"|"coins"|mastery|evidence|correct_?answer|hints_?used/i);
  });
});

describe("Arkivskabet — introduction (D-310, LPD §5.1 stage 1)", () => {
  it("each content card has at most 80 words, and there are 1–3 of them", () => {
    expect(INTRO_CARDS.length).toBeGreaterThanOrEqual(1);
    expect(INTRO_CARDS.length).toBeLessThanOrEqual(3);
    for (const c of INTRO_CARDS) expect(wordCount(c.text), c.title).toBeLessThanOrEqual(80);
  });

  it("the comprehension check judges nothing: one explanation for every choice, no right/wrong words", () => {
    expect(INTRO_CHECK.options).toHaveLength(2);
    expect(INTRO_CHECK.explanation).not.toMatch(/(rigtigt|forkert|korrekt)/i);
  });

  it("the introduction teaches the method the tasks use: who, when, to whom", () => {
    const text = INTRO_CARDS.map((c) => c.text).join(" ");
    for (const q of ["Hvem har lavet den?", "Hvornår?", "Til hvem?"]) expect(text).toContain(q);
  });
});

describe("Arkivskabet — the game's import graph never reaches answer keys or the test adapter", () => {
  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

  function reachable(entry: string): Map<string, string[]> {
    const seen = new Map<string, string[]>();
    const go = (file: string): void => {
      if (seen.has(file)) return;
      const text = readFileSync(file, "utf8");
      const specs = [...text.matchAll(/^\s*import\s[^"']*["']([^"']+)["']/gm)].map((m) => m[1] as string);
      seen.set(file, specs);
      for (const s of specs) if (s.startsWith("./")) go(join(dirname(file), s));
    };
    go(join(SRC, entry));
    return seen;
  }

  it("game-main.ts reaches no host file, no item list and no test adapter", () => {
    const graph = reachable("game-main.ts");
    const files = [...graph.keys()].map((f) => f.replace(SRC, "").replace(/\\/g, "/"));
    expect(files).toContain("/task-view.ts");
    expect(files.some((f) => /host/.test(f))).toBe(false);
    const specs = [...graph.values()].flat();
    expect(specs.some((s) => s.includes("test-service"))).toBe(false);
    expect(specs.some((s) => s.includes("supabase"))).toBe(false);
  });

  it("the host does use the test adapter (so the check above is meaningful)", () => {
    const specs = [...reachable("host-main.ts").values()].flat();
    expect(specs).toContain("@adventure-engine/learning-bridge/test-service");
    expect(specs).toContain("./host-items.ts");
  });
});
